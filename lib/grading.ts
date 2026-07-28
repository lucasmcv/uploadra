import { GoogleGenAI } from "@google/genai";

export interface GradingResult {
  isCorrect: boolean;
  feedback: string;
}

const GRADING_PROMPT_HEADER = `Sos un corrector de ejercicios de dictado/comprensión. Te doy el texto real de un fragmento (la "respuesta correcta") y lo que escribió una persona intentando reproducir o resumir ese contenido de oído. Tu tarea es evaluar si la respuesta de la persona captura correctamente el contenido del fragmento.

Reglas:
- No exijas una transcripción palabra por palabra: aceptá paráfrasis, sinónimos, errores menores de tipeo/ortografía, y que falten palabras de relleno.
- Marcá como incorrecto si falta información clave, si dice algo distinto o contrario al fragmento, o si la respuesta está vacía/no tiene relación.
- El feedback debe ser breve (una oración), en el mismo idioma del fragmento, dirigido a la persona ("Correcto", "Te faltó mencionar...", "Eso no es lo que dice el fragmento...").
- Devolvé SOLO un JSON: {"is_correct": boolean, "feedback": string}, sin texto adicional, sin markdown.

Fragmento (respuesta correcta): """{{CORRECT}}"""
Respuesta de la persona: """{{ANSWER}}"""`;

export async function evaluateOpenAnswer(
  correctText: string,
  userAnswer: string
): Promise<GradingResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !userAnswer.trim()) return null;

  const client = new GoogleGenAI({ apiKey });
  const prompt = GRADING_PROMPT_HEADER.replace("{{CORRECT}}", correctText).replace(
    "{{ANSWER}}",
    userAnswer
  );

  try {
    const response = await client.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    const text = response.text ?? "";
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { is_correct?: boolean; feedback?: string };
    if (typeof parsed.is_correct !== "boolean" || typeof parsed.feedback !== "string") {
      return null;
    }

    return { isCorrect: parsed.is_correct, feedback: parsed.feedback };
  } catch (err) {
    console.error("[grading] Falló la evaluación de la respuesta:", err);
    return null;
  }
}
