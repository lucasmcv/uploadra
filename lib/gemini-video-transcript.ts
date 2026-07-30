// Normalizes a pasted transcript (from YouTube's own "Mostrar transcripción"
// panel, TurboScribe, or similar) into timed segments via Gemini, used as a
// fallback when the fast regex parser (lib/youtube-transcript.ts) doesn't
// recognize the pasted format. Gemini's job here is ONLY reformatting —
// timestamps are extracted literally from what the user pasted, never
// invented or adjusted, since they're the one piece of ground truth we
// can't verify any other way.

import { GoogleGenAI, Type, type Schema } from "@google/genai";
import {
  LAST_SEGMENT_SPAN_SECONDS,
  timestampToSeconds,
  type ParsedTranscriptSegment,
} from "@/lib/youtube-transcript";
import { generateContentWithRetry } from "@/lib/gemini-retry";

const MODEL = "gemini-flash-latest";

// Forces Gemini to return well-formed JSON matching this shape exactly,
// instead of relying purely on the "return ONLY a JSON array" prompt
// instruction (which free-text generation can partially ignore).
const TRANSCRIPT_SEGMENTS_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start: { type: Type.STRING },
      text: { type: Type.STRING },
    },
    required: ["start", "text"],
  },
};

function parseTranscriptJson(responseText: string): { start: string; text: string }[] {
  const match = /\[[\s\S]*\]/.exec(responseText);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return (parsed as Array<{ start?: unknown; text?: unknown }>).filter(
    (s): s is { start: string; text: string } =>
      typeof s.start === "string" && typeof s.text === "string" && s.text.trim().length > 0
  );
}

export async function normalizeTranscriptWithGemini(
  rawTranscriptText: string,
  apiKey: string | null
): Promise<ParsedTranscriptSegment[]> {
  if (!apiKey) {
    throw new Error("No hay ninguna clave de Gemini configurada (ni propia del usuario ni de la plataforma).");
  }
  const client = new GoogleGenAI({ apiKey });

  const prompt = `Te voy a pasar una transcripción pegada desde un servicio de transcripción (YouTube, TurboScribe, u otro).
Puede estar en varios formatos posibles: (0:15) texto, 0:15 texto, [0:15] texto, etc.

Tu tarea ÚNICAMENTE es reformatear ese texto a JSON, sin cambiar NI UN SEGUNDO los tiempos.
Los tiempos deben ser EXTRAÍDOS LITERALMENTE de lo que ves, sin ajustes ni correcciones.

Devolvé ÚNICAMENTE un JSON array con este formato exacto, sin texto adicional ni bloques de código:
[{"start": "MM:SS", "text": "..."}, {"start": "MM:SS", "text": "..."}, ...]

Donde "start" es el tiempo en formato MM:SS (o H:MM:SS si el video es muy largo), extraído exactamente como aparece en el original.
Si no hay tiempos en una línea, ignora esa línea.
Si hay múltiples líneas de texto para un mismo timestamp, combínalas en un solo elemento.

Aquí es la transcripción pegada:
${rawTranscriptText}`;

  const response = await generateContentWithRetry(client, {
    model: MODEL,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: TRANSCRIPT_SEGMENTS_SCHEMA,
    },
  });

  const parsedSegments = parseTranscriptJson(response.text ?? "");
  if (parsedSegments.length === 0) {
    throw new Error(
      "No se pudo extraer segmentos con tiempos de la transcripción pegada. Asegurate de que incluya tiempos en alguno de estos formatos: (0:15), [0:15], o 0:15"
    );
  }

  return parsedSegments.map((s, i) => ({
    startTime: timestampToSeconds(s.start),
    endTime:
      i < parsedSegments.length - 1
        ? timestampToSeconds(parsedSegments[i + 1].start)
        : timestampToSeconds(s.start) + LAST_SEGMENT_SPAN_SECONDS,
    text: s.text.trim(),
  }));
}
