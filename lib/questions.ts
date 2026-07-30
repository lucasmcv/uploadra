import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type { QuestionMode } from "@/lib/types";
import { generateContentWithRetry, isDailyQuotaExhausted, quotaExhaustedMessage } from "@/lib/gemini-retry";

// Structured output (responseSchema) forces Gemini to return JSON matching
// this shape exactly — no missing fields, no wrapping the array in
// explanatory prose, no risk of the free-text "return ONLY a JSON array"
// instruction being partially ignored. This only guarantees the response's
// FORM, not the content-quality rules below (self-containedness etc.),
// which still rely on the prompt text and the verify checkpoint.
const OPEN_QUESTIONS_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      order_index: { type: Type.INTEGER },
      question: { type: Type.STRING },
    },
    required: ["order_index", "question"],
  },
};

const MCQ_QUESTIONS_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      order_index: { type: Type.INTEGER },
      question: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "4", maxItems: "4" },
      correct_index: { type: Type.INTEGER, minimum: 0, maximum: 3 },
    },
    required: ["order_index", "question", "options", "correct_index"],
  },
};

export interface FragmentForQuestion {
  orderIndex: number;
  text: string;
}

export interface GeneratedQuestion {
  question: string;
  options: string[] | null;
  correctOptionIndex: number | null;
}

// A single generation call covering too many fragments at once risks the
// same quality degradation as one giant transcription request (see
// lib/gemini-video-transcript.ts) — a long video/document can have well
// over a hundred fragments, so those are split into batches this size
// instead of one massive prompt.
const BATCH_SIZE = 25;

function batch<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

const SELF_CONTAINED_RULE = `- La pregunta debe ser AUTOCONTENIDA y específica: alguien que conoce el tema debe poder intentar responderla sin haber visto ni escuchado el fragmento — el video/audio está ahí solo para verificar o ampliar la respuesta, no para poder entender de qué se pregunta. Mencioná en la pregunta el tema o contexto concreto en juego (nunca preguntas vagas o genéricas como "¿qué se dice en este fragmento?" o "¿qué se menciona acá?"). Al mismo tiempo, el fragmento debe seguir siendo la respuesta DIRECTA y completa a esa pregunta — no alcanza con que estén relacionados temáticamente. Ejemplo: si el fragmento dice "el diagnóstico de diabetes se hace con una glucemia en ayunas mayor a 126 mg/dl en dos ocasiones", la pregunta correcta es "¿Con qué valor de glucemia en ayunas se diagnostica diabetes?" (específica, autocontenida, Y el fragmento la responde directamente) — NO "¿Cómo se hace el diagnóstico de diabetes?" (demasiado amplia: ese fragmento podría no ser la respuesta completa si hay otros criterios en otros fragmentos).

REGLA ABSOLUTA, sin excepciones: la pregunta NUNCA puede depender de contexto implícito de otros fragmentos que el lector no tiene — nunca uses referencias como "el paciente", "este caso", "dicho estudio", "el cuadro mencionado" sin resolver de qué se trata dentro de la MISMA pregunta. Si el fragmento es la continuación de un caso clínico o ejemplo narrado en fragmentos anteriores (por ejemplo "Al no encontrar en la tomografía causas que lo justifiquen, ¿qué decisión se tomó?" — esto es inválido porque asume que el lector ya sabe de qué paciente/cuadro se habla), tenés que REFORMULAR la pregunta en términos generales/conceptuales que cualquiera pueda entender sin haber visto el resto del video. Ejemplo de reformulación correcta: en vez de "¿qué decisión se tomó?" (depende de contexto previo), preguntá "¿Qué conducta se debe tomar cuando la tomografía no muestra causas alternativas en un paciente con sospecha de encefalitis y fiebre?" (autocontenida: incluye el contexto clínico necesario dentro de la pregunta misma).`;

const SKIP_RULE = `- EXCEPCIÓN, criterio MUY estricto: si un fragmento genuinamente no tiene NINGÚN contenido conceptual o factual que se pueda convertir en una pregunta autocontenida (por ejemplo: una anécdota personal sin ninguna enseñanza o dato concreto, un chiste, un saludo, una transición tipo "bueno, sigamos" sin información nueva), NO generes pregunta para ese fragmento — omitilo del array de resultados (no incluyas su order_index). Usá esta excepción SOLO cuando estés absolutamente seguro de que NINGUNA pregunta autocontenida sería posible, ni siquiera reformulando en términos generales. Ante la duda, preferí generar la pregunta en vez de omitir — omitir debería ser la excepción rara, no la norma.`;

const OPEN_PROMPT_HEADER = `Para cada fragmento numerado abajo, generá una pregunta de comprensión cuya respuesta directa y completa sea exactamente (o muy cercana a) el texto de ese fragmento — no una pregunta más amplia que ese fragmento solo responda parcialmente. El fragmento funciona como la "respuesta" que la persona va a ver/escuchar justo después de leer la pregunta.

Reglas:
- Una pregunta por fragmento, en el mismo idioma del fragmento.
- La pregunta debe poder responderse con el contenido de ese fragmento específico, no con otros.
${SELF_CONTAINED_RULE}
- Si el fragmento es una oración declarativa, formulá una pregunta natural que lleve a esa respuesta.
- La pregunta NUNCA debe incluir la respuesta, ni siquiera parcialmente, ni entre paréntesis.
- Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string}, sin texto adicional, sin markdown.
`;

const MCQ_PROMPT_HEADER = `Para cada fragmento numerado abajo, generá una pregunta de opción múltiple con 4 opciones (una correcta, tres distractores plausibles) cuya opción correcta sea exactamente (o muy cercana a) el texto de ese fragmento — no una pregunta más amplia que ese fragmento solo responda parcialmente. El fragmento funciona como la "respuesta" que la persona va a ver/escuchar justo después de leer la pregunta y elegir una opción.

Reglas:
- Una pregunta por fragmento, en el mismo idioma del fragmento.
- Las 4 opciones deben ser plausibles entre sí (misma longitud/estilo aproximado), pero solo una correcta.
- La opción correcta debe coincidir con el contenido de ese fragmento específico.
${SELF_CONTAINED_RULE}
- La pregunta NUNCA debe incluir la respuesta, ni siquiera parcialmente, ni entre paréntesis.
- Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string, "options": [string, string, string, string], "correct_index": number}, sin texto adicional, sin markdown. correct_index es 0-based.
`;

export interface GenerateQuestionsOptions {
  /**
   * When true (video/audio segments), Gemini is allowed to omit a
   * fragment entirely when it has no answerable content (small talk,
   * personal anecdotes, transitions) — omitted fragments simply end up
   * with no question, rather than a forced fallback. A batch that fails
   * outright (network/quota error) is a different case: those fragments
   * DO get backfilled with an honest "generation failed" fallback,
   * because that's a system failure, not a content judgment.
   * When false (default, text documents — unchanged behavior), every
   * fragment always gets a question; the caller is expected to call
   * backfillMissingQuestions itself afterward, as it always has.
   */
  allowSkipping?: boolean;
}

export async function generateQuestions(
  fragments: FragmentForQuestion[],
  mode: QuestionMode,
  apiKey: string | null,
  options: GenerateQuestionsOptions = {}
): Promise<Map<number, GeneratedQuestion>> {
  if (!apiKey || fragments.length === 0) return new Map();

  const client = new GoogleGenAI({ apiKey });
  const result = new Map<number, GeneratedQuestion>();
  const promptHeader =
    (mode === "mcq" ? MCQ_PROMPT_HEADER : OPEN_PROMPT_HEADER) + (options.allowSkipping ? `${SKIP_RULE}\n` : "") +
    "\nFragmentos:\n";

  for (const chunk of batch(fragments, BATCH_SIZE)) {
    const numbered = chunk.map((s) => `${s.orderIndex}: ${s.text}`).join("\n");
    const prompt = promptHeader + numbered;

    try {
      const response = await generateContentWithRetry(client, {
        model: "gemini-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: mode === "mcq" ? MCQ_QUESTIONS_SCHEMA : OPEN_QUESTIONS_SCHEMA,
        },
      });

      const questions =
        mode === "mcq" ? parseMcqQuestions(response.text ?? "") : parseOpenQuestions(response.text ?? "");
      for (const [orderIndex, q] of questions) result.set(orderIndex, q);
    } catch (err) {
      console.error("[questions] Falló la generación de preguntas para un lote:", err);
      // A real system failure (not a content decision) — only backfill
      // here, for this chunk, when the caller opted into skipping;
      // otherwise the caller's own backfillMissingQuestions pass (over
      // the FULL fragment list) covers it, unchanged from before.
      if (options.allowSkipping) {
        const reason = isDailyQuotaExhausted(err) ? quotaExhaustedMessage() : undefined;
        backfillMissingQuestions(chunk, result, reason);
      }
    }
  }

  stripEmbeddedAnswerParens(result);
  return result;
}

/**
 * Hard requirement: a question must never embed its own answer in
 * parentheses (e.g. "¿Qué significa neoplasia (nuevo crecimiento)?" is
 * forbidden). Rather than trust the prompt alone, strip any parenthetical
 * content from the generated question text so the rule holds regardless
 * of what the LLM actually returned.
 */
export function stripEmbeddedAnswerParens(questions: Map<number, GeneratedQuestion>): void {
  for (const [orderIndex, q] of questions) {
    const cleaned = q.question.replace(/\s*\([^)]*\)/g, "").trim();
    if (cleaned !== q.question) {
      questions.set(orderIndex, { ...q, question: cleaned });
    }
  }
}

/**
 * Hard requirement: every fragment must end up with a question (100%
 * coverage). Fills in a fallback for any fragment the LLM call missed or
 * that failed generation entirely (e.g. Gemini's daily free-tier quota ran
 * out mid-video — in that case the prompt never even ran, so no amount of
 * prompt tuning changes this outcome), so the caller never has to treat
 * "no question" as an acceptable outcome. The fallback is honest about
 * being one — rather than faking a crafted question, it shows the actual
 * fragment text so it's still useful at a glance instead of a repeated,
 * content-free phrase.
 */
export function backfillMissingQuestions(
  fragments: FragmentForQuestion[],
  questions: Map<number, GeneratedQuestion>,
  reasonMessage?: string
): void {
  const prefix = reasonMessage ? `(${reasonMessage})` : "(No se pudo generar una pregunta para este fragmento)";
  for (const fragment of fragments) {
    if (!questions.has(fragment.orderIndex)) {
      const snippet =
        fragment.text.length > 80 ? `${fragment.text.slice(0, 80).trim()}…` : fragment.text;
      questions.set(fragment.orderIndex, {
        question: `${prefix} "${snippet}"`,
        options: null,
        correctOptionIndex: null,
      });
    }
  }
}

const VERIFY_OPEN_PROMPT_HEADER = `Actuá como un revisor de control de calidad. Para cada par de fragmento y pregunta ya generados abajo, verificá que la pregunta corresponda de forma adecuada y exclusiva a ESE fragmento — su respuesta directa debe ser el contenido de ese fragmento específico, no el de otro fragmento ni algo genérico que podría aplicar a cualquiera.

- Si la pregunta ya corresponde bien Y es autocontenida/específica, devolvé el mismo texto tal cual.
- Si no corresponde bien (es ambigua, encajaría mejor con otro fragmento, no tiene relación clara con el fragmento, o es demasiado amplia y el fragmento solo la responde parcialmente), O si es vaga/genérica (del estilo "¿qué se dice en este fragmento?", "¿qué se menciona acá?", que no se puede intentar responder sin haber visto el fragmento), O si depende de contexto implícito de otros fragmentos (usa "el paciente", "este caso", "dicho estudio" u otra referencia sin resolver de qué se trata), reemplazala por una pregunta nueva, específica y autocontenida que sí corresponda.
${SELF_CONTAINED_RULE}
- La pregunta nunca debe incluir la respuesta ni siquiera entre paréntesis.

Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string}, uno por cada fragmento recibido, sin texto adicional, sin markdown.

Fragmentos y preguntas a revisar:
`;

const VERIFY_MCQ_PROMPT_HEADER = `Actuá como un revisor de control de calidad. Para cada fragmento con su pregunta de opción múltiple ya generada abajo, verificá que la opción marcada como correcta corresponda de forma adecuada y exclusiva al contenido de ESE fragmento específico, y que las 4 opciones sigan siendo plausibles entre sí.

- Si ya está bien Y la pregunta es autocontenida/específica, devolvé la misma pregunta y opciones tal cual.
- Si no corresponde bien (la opción "correcta" no coincide con el fragmento, es ambigua, encajaría mejor con otro fragmento, o es demasiado amplia y el fragmento solo la responde parcialmente), O si la pregunta es vaga/genérica, O si depende de contexto implícito de otros fragmentos (usa "el paciente", "este caso", "dicho estudio" u otra referencia sin resolver de qué se trata), generá una versión corregida: 4 opciones plausibles (mismo estilo/longitud aproximada), una sola correcta que coincida con ese fragmento específico.
${SELF_CONTAINED_RULE}
- La pregunta nunca debe incluir la respuesta, ni siquiera entre paréntesis.

Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string, "options": [string, string, string, string], "correct_index": number}, uno por cada fragmento recibido, sin texto adicional, sin markdown. correct_index es 0-based.

Fragmentos y preguntas a revisar:
`;

/**
 * Checkpoint run once after every other question-generation step
 * (generateQuestions + backfillMissingQuestions) completes: sends every
 * (fragment, question) pair back to the LLM in a single batched call and
 * asks it to confirm or correct each one, so a fragment can never end up
 * paired with a question that actually belongs to a different fragment
 * (or no fragment at all, in the case of a generic backfilled one that
 * turns out to have enough content for a real question). Mutates
 * `questions` in place with whatever the review returns; on any failure
 * (missing API key, network error, unparseable response) it's a no-op —
 * the previously generated questions are kept rather than lost.
 */
export async function verifyQuestionCorrespondence(
  fragments: FragmentForQuestion[],
  questions: Map<number, GeneratedQuestion>,
  mode: QuestionMode,
  apiKey: string | null
): Promise<void> {
  if (!apiKey || fragments.length === 0) return;

  const client = new GoogleGenAI({ apiKey });

  for (const chunk of batch(fragments, BATCH_SIZE)) {
    const lines = chunk
      .map((fragment) => {
        const q = questions.get(fragment.orderIndex);
        if (!q) return null;
        if (mode === "mcq" && q.options) {
          return `${fragment.orderIndex}: FRAGMENTO: "${fragment.text}" | PREGUNTA ACTUAL: "${q.question}" | OPCIONES: ${JSON.stringify(q.options)} | CORRECTA_ACTUAL: ${q.correctOptionIndex}`;
        }
        return `${fragment.orderIndex}: FRAGMENTO: "${fragment.text}" | PREGUNTA ACTUAL: "${q.question}"`;
      })
      .filter((line): line is string => line !== null);

    if (lines.length === 0) continue;

    const prompt = (mode === "mcq" ? VERIFY_MCQ_PROMPT_HEADER : VERIFY_OPEN_PROMPT_HEADER) + lines.join("\n");

    try {
      const response = await generateContentWithRetry(client, {
        model: "gemini-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: mode === "mcq" ? MCQ_QUESTIONS_SCHEMA : OPEN_QUESTIONS_SCHEMA,
        },
      });

      const reviewed =
        mode === "mcq" ? parseMcqQuestions(response.text ?? "") : parseOpenQuestions(response.text ?? "");

      for (const [orderIndex, q] of reviewed) {
        questions.set(orderIndex, q);
      }
    } catch (err) {
      console.error("[questions] Falló el checkpoint de verificación de correspondencia para un lote:", err);
      // Keep the previously generated questions for this batch rather than losing them.
    }
  }

  stripEmbeddedAnswerParens(questions);
}

function extractJsonArray(text: string): unknown[] {
  const match = /\[[\s\S]*\]/.exec(text);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    console.error("[questions] No se pudo parsear la respuesta del LLM:", err);
    return [];
  }
}

function parseOpenQuestions(text: string): Map<number, GeneratedQuestion> {
  const result = new Map<number, GeneratedQuestion>();
  for (const item of extractJsonArray(text) as Array<{ order_index: number; question: string }>) {
    if (typeof item.order_index === "number" && typeof item.question === "string") {
      result.set(item.order_index, { question: item.question, options: null, correctOptionIndex: null });
    }
  }
  return result;
}

function parseMcqQuestions(text: string): Map<number, GeneratedQuestion> {
  const result = new Map<number, GeneratedQuestion>();
  for (const item of extractJsonArray(text) as Array<{
    order_index: number;
    question: string;
    options: string[];
    correct_index: number;
  }>) {
    if (
      typeof item.order_index === "number" &&
      typeof item.question === "string" &&
      Array.isArray(item.options) &&
      item.options.length === 4 &&
      item.options.every((o) => typeof o === "string") &&
      typeof item.correct_index === "number" &&
      item.correct_index >= 0 &&
      item.correct_index <= 3
    ) {
      result.set(item.order_index, {
        question: item.question,
        options: item.options,
        correctOptionIndex: item.correct_index,
      });
    }
  }
  return result;
}
