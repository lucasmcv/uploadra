"""
IMPLEMENTED — .txt, .pdf and .docx are all supported. See
lib/text-fragmentation.ts (fragmentLines: sentence splitting with
page-relative line tracking), lib/document-extraction.ts (extractPages:
per-format text extraction — real pages for PDF via unpdf/pdf.js, page 1
for .txt and .docx since neither format stores real pagination), lib/questions.ts
(generateQuestions, stripEmbeddedAnswerParens, backfillMissingQuestions —
the TS port of the two rules below), app/api/documents/route.ts (upload +
extraction + generation pipeline), and components/document/* +
hooks/useDocumentPracticePlayback.ts (practice/review UI, verified against
a real 2-page PDF showing p.1/p.2 correctly and a .docx). This file's
verification/cleanup functions are kept as standalone Python utilities
(e.g. for auditing an exported question list outside the app) — the app
itself enforces the same rules in TypeScript, not by shelling out to this
file.

Also implemented since this was first written: automatic grading of open
answers. See lib/grading.ts (evaluateOpenAnswer — compares the user's
answer against the literal source fragment, never a paraphrase, via
Gemini) wired into both app/api/segments/[id]/answer/route.ts and
app/api/document-fragments/[id]/answer/route.ts, with isCorrect/feedback
columns on Answer/DocAnswer and a ✓/✗ display in both practice
(components/player/QuestionCard.tsx) and review
(components/player/SegmentOverlay.tsx, components/document/DocumentReviewView.tsx).

GOAL
----
A new content source alongside video/audio: upload a book/chapter as PDF,
DOCX, or TXT. Generate study questions covering 100% of the text.

QUESTION FORMAT (exact, user-specified)
----------------------------------------
Each question line:

    N.(p.PAGE, l.LINE_START-LINE_END) ¿Question text?

Example:

    1.(p.12, l.3-7) ¿Pregunta aquí?

Numbering (N) is CONTINUOUS from 1 to the end of the whole text — never
reset partway through.

RULE 1 — TOTAL COVERAGE
-------------------------
Every sentence/fragment in the source text that carries informative content
must produce at least one question. No part of the text may be silently
skipped. (User explicitly simplified this from an earlier "verify and
self-correct per block" framing — just: generate, then check coverage is
100%, and backfill anything missed before delivering. No per-block loop.)

RULE 2 — NEVER EMBED THE ANSWER IN THE QUESTION
--------------------------------------------------
The question text must never contain the answer, not even partially, not
even inside parentheses. Forbidden examples the user gave:
    (BAD) ¿Qué significa neoplasia (nuevo crecimiento)?
    (BAD) ¿Cuál es la causa más frecuente de cirrosis (el alcohol)?
    (BAD) ¿Qué enzima está elevada en el infarto (troponina)?
The only parenthetical allowed in the line is the leading (p.X, l.Y-Z)
reference — nothing else in parentheses, ever.

OPEN QUESTIONS FOR THE USER (ask before implementing)
------------------------------------------------------
- Does this reuse the existing segment -> question -> practice/review
  player UI (page/line ref replacing timestamp, a reading view replacing
  the video player, same open/mcq answer modes)? Or is it a separate
  "generate an exportable question list" feature with no interactive
  player at all?
- Page-accurate extraction is a genuinely hard problem per format:
    - PDF: has real fixed pages. Needs a text-extraction lib that keeps
      per-page text (e.g. pdfjs-dist, or Python: pypdf / pdfplumber).
    - DOCX: has NO fixed page concept in the file itself — Word computes
      pagination at render time based on page size/margins/fonts, which
      isn't stored in the .docx XML. Would need either (a) a rendering
      step (e.g. LibreOffice headless -> PDF -> extract with page numbers)
      or (b) redefine "page" as an arbitrary fixed-line-count chunk for
      this format and say so clearly to the user.
    - TXT: no page concept at all. Same "arbitrary fixed-line-count chunk"
      approach as DOCX, or drop "page" and use only line numbers for TXT.
  Recommend: ship .txt first (line numbers only, or fixed-chunk "pages"),
  add PDF next (real pages), decide DOCX handling once the above is picked.
- Confirm which formats are actually needed for v1.

VERIFICATION SCRIPTS (user-supplied, copied verbatim below as real
functions instead of a prompt-only description)
--------------------------------------------------------------------
"""

from __future__ import annotations

import re

QUESTION_LINE_PATTERN = re.compile(r"^(\s*\d+\.\s*)(\([^)]*\))(\s*)(.*)$")


def verify_no_embedded_answers(preguntas: list[str]) -> list[str]:
    """
    Checks that no generated question line embeds its own answer in a
    parenthetical after the (p.X, l.Y-Z) reference.

    Returns a list of error strings (empty list = all good). This is the
    user's original script, adapted into a function that returns errors
    instead of just printing them (call print_verification_result() below
    to get the exact original console-message behavior).
    """
    errores: list[str] = []
    for i, linea in enumerate(preguntas, 1):
        m = QUESTION_LINE_PATTERN.match(linea)
        if not m:
            errores.append(f"Línea {i} no tiene formato válido: {linea}")
            continue
        _, _, _, resto = m.groups()
        resto_limpio = re.sub(r"\s*\([^)]*\)", "", resto)
        if resto_limpio != resto:
            errores.append(f"Pregunta {i} contiene respuesta embebida: {linea}")
    return errores


def print_verification_result(preguntas: list[str]) -> None:
    """Same console output as the user's original script."""
    errores = verify_no_embedded_answers(preguntas)
    if errores:
        print("ERRORES ENCONTRADOS:")
        for e in errores:
            print(e)
    else:
        print("Verificación OK: ninguna pregunta contiene respuestas embebidas.")


def verify_coverage(fragmentos_count: int, preguntas_count: int) -> str:
    """
    Reports coverage using the exact message format the user specified:
    "Verificación de cobertura: N fragmentos identificados, N preguntas
    generadas. Cobertura: 100%."

    Caller is responsible for actually backfilling any gap BEFORE calling
    this — this function only reports, it doesn't find missing fragments
    (that requires the real fragment-to-question mapping, which doesn't
    exist yet since generation itself isn't implemented).
    """
    pct = (preguntas_count / fragmentos_count * 100) if fragmentos_count else 0
    return (
        f"Verificación de cobertura: {fragmentos_count} fragmentos identificados, "
        f"{preguntas_count} preguntas generadas. Cobertura: {pct:.0f}%."
    )


def cleanup_embedded_answers(lines: list[str]) -> list[str]:
    """
    User's "cleanup an already-generated file" script, adapted into a
    function (print-only in the original — this version returns the
    cleaned lines; call main() below to reproduce the original CLI
    print-only behavior exactly, including the residual-parens count).
    """
    out_lines: list[str] = []
    for line in lines:
        if not line.strip():
            continue
        m = QUESTION_LINE_PATTERN.match(line)
        if not m:
            continue
        num, ts, sp, rest = m.groups()
        new_rest = re.sub(r"\s*\([^)]*\)", "", rest)
        new_rest = re.sub(r"\s+([?.,;:])", r"\1", new_rest)
        new_rest = re.sub(r"\s{2,}", " ", new_rest).strip()
        out_lines.append(f"{num.strip()}{ts}{sp}{new_rest}")
    return out_lines


def main(path: str) -> None:
    """Reproduces the user's original cleanup script CLI output exactly."""
    with open(path, encoding="utf-8") as f:
        lines = [l for l in f.read().split("\n") if l.strip()]

    out_lines = cleanup_embedded_answers(lines)

    restantes = 0
    for ol in out_lines:
        primer_cierre = ol.find(")")
        if "(" in ol[primer_cierre + 1 :]:
            restantes += 1

    print(f"Total preguntas: {len(out_lines)}")
    print(f"Preguntas con paréntesis residuales: {restantes}")
    for l in out_lines:
        print(l)


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print(f"Uso: python {sys.argv[0]} archivo.txt")
        raise SystemExit(1)
    main(sys.argv[1])
