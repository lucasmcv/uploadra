import { getDocumentProxy, extractTextItems } from "unpdf";

export interface ExtractedPage {
  pageNumber: number;
  lines: string[];
}

export type DocumentSourceFormat = "txt" | "pdf" | "docx";

/**
 * Extracts text as an array of pages, each with an array of lines (1-based
 * position = line number *within that page*, matching the "(p.X, l.Y-Z)"
 * citation format).
 *
 * - txt: no real pages, whole file is page 1 (there's no page concept in
 *   plain text at all).
 * - pdf: real pages via pdf.js (unpdf); lines reconstructed from text items
 *   using PDF.js's own end-of-line detection.
 * - docx: Word doesn't store real pagination in the file (it's computed at
 *   render time from page size/margins/fonts), so — same convention as txt
 *   — the whole document is page 1; each paragraph is treated as one line.
 */
export async function extractPages(
  buffer: Buffer,
  format: DocumentSourceFormat
): Promise<ExtractedPage[]> {
  if (format === "txt") {
    const lines = buffer.toString("utf-8").replace(/\r\n/g, "\n").split("\n");
    return [{ pageNumber: 1, lines }];
  }

  if (format === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { items } = await extractTextItems(pdf);

    return items.map((pageItems, index) => {
      const lines: string[] = [];
      let current = "";
      for (const item of pageItems) {
        current += item.str;
        if (item.hasEOL) {
          lines.push(current);
          current = "";
        }
      }
      if (current.trim()) lines.push(current);
      return { pageNumber: index + 1, lines };
    });
  }

  if (format === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const lines = result.value.replace(/\r\n/g, "\n").split("\n");
    return [{ pageNumber: 1, lines }];
  }

  throw new Error(`Formato de documento no soportado: ${format}`);
}
