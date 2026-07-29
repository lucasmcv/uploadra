// Parses text pasted from YouTube's own "Mostrar transcripción" panel into
// timed segments, reusing the exact same Segment shape (startTime/endTime/
// text) as the Whisper worker pipeline. This exists specifically to avoid
// ever having the server contact YouTube to download audio — YouTube's
// bot-detection blocks that from datacenter IPs, but the transcript panel
// is something only the user's own browser ever touches, so pasting its
// text sidesteps the block entirely (see worker/README.md for the full
// investigation that led here).
//
// YouTube's copy output comes in two shapes depending on browser/OS, and
// both are supported:
//   1) timestamp alone on its own line, caption text on the line(s) after:
//        0:15
//        texto del segmento
//   2) timestamp and text on the same line:
//        0:15  texto del segmento

export interface ParsedTranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
}

const TIMESTAMP_ONLY = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
const TIMESTAMP_PREFIX = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;

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
