// Parses text pasted from either YouTube's own "Mostrar transcripción" panel
// or TurboScribe's transcript output into timed segments, reusing the exact
// same Segment shape (startTime/endTime/text) as the Whisper worker
// pipeline. This exists specifically to avoid ever having the server
// contact YouTube to download audio — YouTube's bot-detection blocks that
// from datacenter IPs, but a transcript the user's own browser fetched
// (from YouTube's panel or a third-party site) sidesteps the block
// entirely (see worker/README.md for the full investigation that led here).
//
// Two pasted formats are supported:
//   1) YouTube, timestamp alone on its own line, text on the line(s) after
//      (or on the same line):
//        0:15
//        texto del segmento
//   2) TurboScribe, timestamp in parentheses. Critically, TurboScribe's own
//      page renders these INLINE within a flowing paragraph — multiple
//      "(M:SS)" markers can appear in the same line/paragraph, not one per
//      line — e.g. "(0:00) texto... (0:06) más texto... (0:13) más texto".
//      So this format is parsed by scanning the WHOLE raw text for every
//      "(M:SS)" occurrence (regardless of line breaks) and slicing the text
//      between consecutive matches, rather than processing line by line.

export interface ParsedTranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
}

const TIMESTAMP_ONLY = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
const TIMESTAMP_PREFIX = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+)$/;
const HAS_PAREN_TIMESTAMP = /\((?:\d{1,2}:)?\d{1,2}:\d{2}\)/;

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

function toSegments(rawSegments: { time: number; text: string }[]): ParsedTranscriptSegment[] {
  const withText = rawSegments.filter((s) => s.text.trim().length > 0);
  return withText.map((segment, i) => ({
    startTime: segment.time,
    endTime: i < withText.length - 1 ? withText[i + 1].time : segment.time + LAST_SEGMENT_SPAN_SECONDS,
    text: segment.text.trim(),
  }));
}

/** TurboScribe format: scans the whole text for every "(M:SS)" occurrence —
 * wherever it appears, inline or at a line start — and treats the text
 * between one match and the next as that segment's content. */
function parseParenTimestampFormat(raw: string): ParsedTranscriptSegment[] {
  const matches = [...raw.matchAll(/\(((?:\d{1,2}:)?\d{1,2}:\d{2})\)/g)];
  const rawSegments: { time: number; text: string }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const segmentStart = matches[i].index + matches[i][0].length;
    const segmentEnd = i < matches.length - 1 ? matches[i + 1].index : raw.length;
    const text = raw.slice(segmentStart, segmentEnd).replace(/\s+/g, " ").trim();
    rawSegments.push({ time: timestampToSeconds(matches[i][1]), text });
  }

  return toSegments(rawSegments);
}

/** YouTube's own transcript panel format: one timestamp per line (alone or
 * with text on the same line), captions after a bare timestamp line
 * belonging to that timestamp until the next one. */
function parseYoutubeLineFormat(raw: string): ParsedTranscriptSegment[] {
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

  return toSegments(rawSegments);
}

export function parseYoutubeTranscript(raw: string): ParsedTranscriptSegment[] {
  if (HAS_PAREN_TIMESTAMP.test(raw)) {
    return parseParenTimestampFormat(raw);
  }
  return parseYoutubeLineFormat(raw);
}
