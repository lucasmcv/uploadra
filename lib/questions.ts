import { GoogleGenAI } from "@google/genai";
import type { QuestionMode } from "@/lib/types";

interface SegmentForQuestion {
  orderIndex: number;
  transcriptText: string;
}

export interface GeneratedQuestion {
  question: string;
  options: string[] | null;
  correctOptionIndex: number | null;
}

const OPEN_PROMPT_HEADER = `Para cada fragmento de transcripción numerado abajo, generá una pregunta de comprensión cuya respuesta directa sea exactamente (o muy cercana a) el texto de ese fragmento. El fragmento funciona como la "respuesta hablada" que la persona va a escuchar justo después de leer la pregunta.

Reglas:
- Una pregunta por fragmento, en el mismo idioma del fragmento.
- La pregunta debe poder responderse con el contenido de ese fragmento específico, no con otros.
- Si el fragmento es una oración declarativa, formulá una pregunta natural que lleve a esa respuesta.
- Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string}, sin texto adicional, sin markdown.

Fragmentos:
`;

const MCQ_PROMPT_HEADER = `Para cada fragmento de transcripción numerado abajo, generá una pregunta de opción múltiple con 4 opciones (una correcta, tres distractores plausibles) cuya opción correcta sea exactamente (o muy cercana a) el texto de ese fragmento. El fragmento funciona como la "respuesta hablada" que la persona va a escuchar justo después de leer la pregunta y elegir una opción.

Reglas:
- Una pregunta por fragmento, en el mismo idioma del fragmento.
- Las 4 opciones deben ser plausibles entre sí (misma longitud/estilo aproximado), pero solo una correcta.
- La opción correcta debe coincidir con el contenido de ese fragmento específico.
- Devolvé SOLO un JSON array de objetos {"order_index": number, "question": string, "options": [string, string, string, string], "correct_index": number}, sin texto adicional, sin markdown. correct_index es 0-based.

Fragmentos:
`;

export async function generateQuestions(
  segments: SegmentForQuestion[],
  mode: QuestionMode
): Promise<Map<number, GeneratedQuestion>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || segments.length === 0) return new Map();

  const client = new GoogleGenAI({ apiKey });
  const numbered = segments.map((s) => `${s.orderIndex}: ${s.transcriptText}`).join("\n");
  const prompt = (mode === "mcq" ? MCQ_PROMPT_HEADER : OPEN_PROMPT_HEADER) + numbered;

  try {
    const response = await client.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    return mode === "mcq" ? parseMcqQuestions(response.text ?? "") : parseOpenQuestions(response.text ?? "");
  } catch (err) {
    console.error("[questions] Falló la generación de preguntas:", err);
    return new Map();
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
