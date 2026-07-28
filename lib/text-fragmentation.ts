export interface TextFragment {
  orderIndex: number;
  lineStart: number;
  lineEnd: number;
  text: string;
}

/**
 * Splits an array of lines (already scoped to a single page — line numbers
 * are page-relative, matching how a real book/PDF citation like "p.12,
 * l.3-7" works) into sentence-level fragments, tracking the (1-based) line
 * numbers each fragment spans. Sentence boundaries are detected with a
 * simple regex (., !, ?) — good enough for MVP coverage, not a full NLP
 * sentence splitter (abbreviations/decimals can over-split occasionally,
 * an acceptable tradeoff here). orderIndex is 0-based *within this page* —
 * callers spanning multiple pages renumber it into a continuous sequence.
 */
export function fragmentLines(lines: string[]): TextFragment[] {
  const lineStartOffsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    lineStartOffsets.push(cursor);
    cursor += line.length + 1; // +1 for the "\n" the lines are joined with
  }
  const normalized = lines.join("\n");

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

/** Convenience wrapper for single-page plain text (e.g. a .txt upload). */
export function fragmentText(rawText: string): TextFragment[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  return fragmentLines(lines);
}
