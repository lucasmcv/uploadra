// Parses text pasted from either YouTube's own "Mostrar transcripción" panel
// or TurboScribe's transcript output into timed segments, reusing the exact
// same Segment shape (startTime/endTime/text) as the Whisper worker
// pipeline. This exists specifically to avoid ever having the server
// contact YouTube to download audio — YouTube's bot-detection blocks that
// from datacenter IPs, but a transcript the user's own browser fetched
// (from YouTube's panel or a third-party site) sidesteps the block
// entirely (see worker/README.md for the full investigation that led here).
//
// Three pasted formats are supported:
//   1) YouTube, timestamp alone on its own line, text on the line(s) after:
//        0:15
//        texto del segmento
//   2) YouTube, timestamp and text on the same line:
//        0:15  texto del segmento
//   3) TurboScribe, timestamp in parentheses prefixing the line:
//        (0:15) texto del segmento

export interface ParsedTranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
}

const TIMESTAMP_ONLY = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
const TIMESTAMP_PREFIX = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;
const PAREN_TIMESTAMP_PREFIX = /^\(((?:\d{1,2}:)?\d{1,2}:\d{2})\)\s*(.*)$/;

export function timestampToSeconds(timestamp: string): number {
  return timestamp
    .split(":")
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);
}

/** Last segment has no "next timestamp" to bound it — give it a generous
 * span so review-mode's `time < endTime` check still matches till the end
 * of the video, regardless of its actual duration (unknown from pasted text). */
export const LAST_SEGMENT_SPAN_SECONDS = 24 * 60 * 60;

export function parseYoutubeTranscript(raw: string): ParsedTranscriptSegment[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rawSegments: { time: number; text: string }[] = [];

  for (const line of lines) {
    if (TIMESTAMP_ONLY.test(line)) {
      rawSegments.push({ time: timestampToSeconds(line), text: "" });
      continue;
    }
    const parenMatch = line.match(PAREN_TIMESTAMP_PREFIX);
    if (parenMatch) {
      rawSegments.push({ time: timestampToSeconds(parenMatch[1]), text: parenMatch[2] });
      continue;
    }
    const prefixMatch = line.match(TIMESTAMP_PREFIX);
    if (prefixMatch) {
      rawSegments.push({ time: timestampToSeconds(prefixMatch[1]), text: prefixMatch[2] });
      continue;
    }
    if (rawSegments.length === 0) continue; // preamble ("Transcripción", etc.)
    const last = rawSegments[rawSegments.length - 1];
    last.text = last.text ? `${last.text} ${line}` : line;
  }

  const withText = rawSegments.filter((s) => s.text.trim().length > 0);

  return withText.map((segment, i) => ({
    startTime: segment.time,
    endTime: i < withText.length - 1 ? withText[i + 1].time : segment.time + LAST_SEGMENT_SPAN_SECONDS,
    text: segment.text.trim(),
  }));
}
