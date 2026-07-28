export interface TextFragment {
  orderIndex: number;
  lineStart: number;
  lineEnd: number;
  text: string;
}

/**
 * Splits raw text into sentence-level fragments, tracking the original
 * (1-based) line numbers each fragment spans. Sentence boundaries are
 * detected with a simple regex (., !, ?) — good enough for MVP coverage,
 * not a full NLP sentence splitter (abbreviations/decimals can over-split
 * occasionally, which is an acceptable tradeoff here).
 */
export function fragmentText(rawText: string): TextFragment[] {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  const lineStartOffsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    lineStartOffsets.push(cursor);
    cursor += line.length + 1; // +1 for the "\n" the lines were joined with
  }

  function offsetToLine(offset: number): number {
    let line = 0;
    for (let i = 0; i < lineStartOffsets.length; i++) {
      if (lineStartOffsets[i] <= offset) line = i;
      else break;
    }
    return line + 1;
  }

  const fragments: TextFragment[] = [];
  const sentenceRegex = /[^.!?]*[.!?]+|[^.!?]+$/g;
  let match: RegExpExecArray | null;
  let orderIndex = 0;

  while ((match = sentenceRegex.exec(normalized)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const leadingWhitespace = raw.length - raw.trimStart().length;
    const startOffset = match.index + leadingWhitespace;
    const endOffset = startOffset + trimmed.length - 1;

    fragments.push({
      orderIndex: orderIndex++,
      lineStart: offsetToLine(startOffset),
      lineEnd: offsetToLine(endOffset),
      text: trimmed,
    });
  }

  return fragments;
}
