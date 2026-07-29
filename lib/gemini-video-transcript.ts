// Transcribes a public YouTube video directly through the Gemini API,
// which supports YouTube URLs as native video input (Google's own
// infrastructure fetches the video — our server never contacts YouTube),
// sidestepping the "Sign in to confirm you're not a bot" block that
// affects any download attempt from a datacenter IP (see
// worker/README.md for that investigation). As of mid-2026 this YouTube
// URL input is a free preview feature of the Gemini API.
//
// Long videos are split into fixed-size chunks (each its own request,
// scoped via videoMetadata.startOffset/endOffset) instead of one single
// generation covering the whole video — LLM output quality tends to
// degrade over very long single generations, so keeping each request
// short and bounded keeps transcription quality consistent regardless of
// video length.

import { GoogleGenAI } from "@google/genai";
import {
  LAST_SEGMENT_SPAN_SECONDS,
  timestampToSeconds,
  type ParsedTranscriptSegment,
} from "@/lib/youtube-transcript";

const MODEL = "gemini-flash-latest";
const CHUNK_SECONDS = 8 * 60;
// Matches Gemini's documented ceiling for video length (3h at low media
// resolution) — a hard stop so a malformed duration reading can't spin
// off an unbounded number of chunk requests.
const MAX_VIDEO_SECONDS = 3 * 60 * 60;

const TRANSCRIBE_PROMPT = `Transcribí el audio hablado de este video, dividido en segmentos de habla natural (frases u oraciones completas, ni muy cortos ni muy largos, como subtítulos). Devolvé ÚNICAMENTE un JSON array, sin texto adicional ni bloques de código, con este formato exacto:
[{"start": "MM:SS", "text": "..."}]
Los tiempos van en formato MM:SS (o H:MM:SS si corresponde) y marcan el inicio de cada segmento. El texto es la transcripción literal de lo dicho, en el idioma original del audio. Si no hay audio hablado, devolvé un array vacío [].`;

interface RawSegment {
  time: number;
  text: string;
}

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

async function getVideoDurationSeconds(client: GoogleGenAI, youtubeUrl: string): Promise<number> {
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      { fileData: { fileUri: youtubeUrl } },
      {
        text: "¿Cuál es la duración total de este video, en segundos? Respondé ÚNICAMENTE con un número entero, sin texto adicional ni unidades.",
      },
    ],
  });
  const match = /\d+/.exec(response.text ?? "");
  if (!match) throw new Error("No se pudo determinar la duración del video.");
  return parseInt(match[0], 10);
}

async function transcribeWholeVideo(client: GoogleGenAI, youtubeUrl: string): Promise<RawSegment[]> {
  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ fileData: { fileUri: youtubeUrl } }, { text: TRANSCRIBE_PROMPT }],
  });
  return parseTranscriptJson(response.text ?? "").map((s) => ({
    time: timestampToSeconds(s.start),
    text: s.text.trim(),
  }));
}

async function transcribeChunk(
  client: GoogleGenAI,
  youtubeUrl: string,
  startSeconds: number,
  endSeconds: number
): Promise<RawSegment[]> {
  const prompt = `${TRANSCRIBE_PROMPT}

Este video se está procesando en partes. Esta parte corresponde exactamente al intervalo desde el segundo ${startSeconds} hasta el segundo ${endSeconds} del video ORIGINAL completo. Los tiempos "start" que devuelvas deben ser ABSOLUTOS respecto al video original completo — por ejemplo, el primer segmento de esta parte debe tener un "start" cercano a ${startSeconds} segundos, no 0.`;

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        fileData: { fileUri: youtubeUrl },
        videoMetadata: { startOffset: `${startSeconds}s`, endOffset: `${endSeconds}s` },
      },
      { text: prompt },
    ],
  });

  return parseTranscriptJson(response.text ?? "").map((s) => {
    let time = timestampToSeconds(s.start);
    // Defensive normalization: if Gemini reset the clock to 0 at the start
    // of this chunk instead of reporting absolute video time, shift it back.
    if (time < startSeconds - 5) time += startSeconds;
    return { time, text: s.text.trim() };
  });
}

export async function transcribeYoutubeWithGemini(youtubeUrl: string): Promise<ParsedTranscriptSegment[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada.");
  }
  const client = new GoogleGenAI({ apiKey });

  const durationSeconds = Math.min(await getVideoDurationSeconds(client, youtubeUrl), MAX_VIDEO_SECONDS);

  let allSegments: RawSegment[];
  if (durationSeconds <= CHUNK_SECONDS) {
    allSegments = await transcribeWholeVideo(client, youtubeUrl);
  } else {
    allSegments = [];
    for (let start = 0; start < durationSeconds; start += CHUNK_SECONDS) {
      const end = Math.min(start + CHUNK_SECONDS, durationSeconds);
      const chunkSegments = await transcribeChunk(client, youtubeUrl, start, end);
      allSegments.push(...chunkSegments);
    }
  }

  allSegments.sort((a, b) => a.time - b.time);
  if (allSegments.length === 0) {
    throw new Error("Gemini no pudo transcribir este video.");
  }

  return allSegments.map((segment, i) => ({
    startTime: segment.time,
    endTime:
      i < allSegments.length - 1 ? allSegments[i + 1].time : segment.time + LAST_SEGMENT_SPAN_SECONDS,
    text: segment.text,
  }));
}
