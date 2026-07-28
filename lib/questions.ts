import { GoogleGenAI } from "@google/genai";
import type { QuestionMode } from "@/lib/types";

export interface FragmentForQuestion {
  orderIndex: number;
  text: string;
}

export interface GeneratedQuestion {
  question: string;
  options: string[] | null;
  correctOptionIndex: number | null;
}

const OPEN_PROMPT_HEADER = `Para cada fragmento numerado abajo, generá una pregunta de comprensión cuya respuesta directa sea exactamente (o muy cercana a) el texto de ese fragmento. El fragmento funciona como la "respuesta" que la persona va a ver/escuchar justo después de leer la pregunta.

Reglas:
- Una pregunta por fragmento, en el mismo idioma del fragmento.
- La pregunta debe poder responderse con el contenido de ese fragmento específico, no con otros.
- Si el fragmento es una oración declarativa, formulá una pregunta natural que lleve a esa respuesta.
- La pregunta NUNCA debe incluir la respuesta, ni siquiera parcialmente, ni entre paréntesis.
- Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string}, sin texto adicional, sin markdown.

Fragmentos:
`;

const MCQ_PROMPT_HEADER = `Para cada fragmento numerado abajo, generá una pregunta de opción múltiple con 4 opciones (una correcta, tres distractores plausibles) cuya opción correcta sea exactamente (o muy cercana a) el texto de ese fragmento. El fragmento funciona como la "respuesta" que la persona va a ver/escuchar justo después de leer la pregunta y elegir una opción.

Reglas:
- Una pregunta por fragmento, en el mismo idioma del fragmento.
- Las 4 opciones deben ser plausibles entre sí (misma longitud/estilo aproximado), pero solo una correcta.
- La opción correcta debe coincidir con el contenido de ese fragmento específico.
- La pregunta NUNCA debe incluir la respuesta, ni siquiera parcialmente, ni entre paréntesis.
- Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string, "options": [string, string, string, string], "correct_index": number}, sin texto adicional, sin markdown. correct_index es 0-based.

Fragmentos:
`;

export async function generateQuestions(
  fragments: FragmentForQuestion[],
  mode: QuestionMode
): Promise<Map<number, GeneratedQuestion>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || fragments.length === 0) return new Map();

  const client = new GoogleGenAI({ apiKey });
  const numbered = fragments.map((s) => `${s.orderIndex}: ${s.text}`).join("\n");
  const prompt = (mode === "mcq" ? MCQ_PROMPT_HEADER : OPEN_PROMPT_HEADER) + numbered;

  try {
    const response = await client.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    const questions =
      mode === "mcq" ? parseMcqQuestions(response.text ?? "") : parseOpenQuestions(response.text ?? "");
    stripEmbeddedAnswerParens(questions);
    return questions;
  } catch (err) {
    console.error("[questions] Falló la generación de preguntas:", err);
    return new Map();
  }
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
 * coverage). Fills in a generic fallback for any fragment the LLM call
 * missed or that failed generation entirely, so the caller never has to
 * treat "no question" as an acceptable outcome.
 */
export function backfillMissingQuestions(
  fragments: FragmentForQuestion[],
  questions: Map<number, GeneratedQuestion>
): void {
  for (const fragment of fragments) {
    if (!questions.has(fragment.orderIndex)) {
      questions.set(fragment.orderIndex, {
        question: "¿Qué se dice en este fragmento?",
        options: null,
        correctOptionIndex: null,
      });
    }
  }
}

const VERIFY_OPEN_PROMPT_HEADER = `Actuá como un revisor de control de calidad. Para cada par de fragmento y pregunta ya generados abajo, verificá que la pregunta corresponda de forma adecuada y exclusiva a ESE fragmento — su respuesta directa debe ser el contenido de ese fragmento específico, no el de otro fragmento ni algo genérico que podría aplicar a cualquiera.

- Si la pregunta ya corresponde bien, devolvé el mismo texto tal cual.
- Si no corresponde bien (es ambigua, encajaría mejor con otro fragmento, es demasiado genérica, o no tiene relación clara con el fragmento), reemplazala por una pregunta nueva que sí corresponda, respetando las mismas reglas de siempre: natural, respondible únicamente con el contenido de ese fragmento específico, nunca debe incluir la respuesta ni siquiera entre paréntesis.

Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string}, uno por cada fragmento recibido, sin texto adicional, sin markdown.

Fragmentos y preguntas a revisar:
`;

const VERIFY_MCQ_PROMPT_HEADER = `Actuá como un revisor de control de calidad. Para cada fragmento con su pregunta de opción múltiple ya generada abajo, verificá que la opción marcada como correcta corresponda de forma adecuada y exclusiva al contenido de ESE fragmento específico, y que las 4 opciones sigan siendo plausibles entre sí.

- Si ya está bien, devolvé la misma pregunta y opciones tal cual.
- Si no corresponde bien (la opción "correcta" no coincide con el fragmento, es ambigua, o encajaría mejor con otro fragmento), generá una versión corregida: 4 opciones plausibles (mismo estilo/longitud aproximada), una sola correcta que coincida con ese fragmento específico. La pregunta nunca debe incluir la respuesta, ni siquiera entre paréntesis.

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
  mode: QuestionMode
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || fragments.length === 0) return;

  const lines = fragments
    .map((fragment) => {
      const q = questions.get(fragment.orderIndex);
      if (!q) return null;
      if (mode === "mcq" && q.options) {
        return `${fragment.orderIndex}: FRAGMENTO: "${fragment.text}" | PREGUNTA ACTUAL: "${q.question}" | OPCIONES: ${JSON.stringify(q.options)} | CORRECTA_ACTUAL: ${q.correctOptionIndex}`;
      }
      return `${fragment.orderIndex}: FRAGMENTO: "${fragment.text}" | PREGUNTA ACTUAL: "${q.question}"`;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) return;

  const client = new GoogleGenAI({ apiKey });
  const prompt = (mode === "mcq" ? VERIFY_MCQ_PROMPT_HEADER : VERIFY_OPEN_PROMPT_HEADER) + lines.join("\n");

  try {
    const response = await client.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    const reviewed =
      mode === "mcq" ? parseMcqQuestions(response.text ?? "") : parseOpenQuestions(response.text ?? "");

    for (const [orderIndex, q] of reviewed) {
      questions.set(orderIndex, q);
    }
    stripEmbeddedAnswerParens(questions);
  } catch (err) {
    console.error("[questions] Falló el checkpoint de verificación de correspondencia:", err);
  }
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
