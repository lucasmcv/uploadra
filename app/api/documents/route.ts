import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentStatus, QuestionMode } from "@/lib/types";
import { fragmentLines, type TextFragment } from "@/lib/text-fragmentation";
import { extractPages, type DocumentSourceFormat } from "@/lib/document-extraction";
import { backfillMissingQuestions, generateQuestions, verifyQuestionCorrespondence } from "@/lib/questions";
import { billingBlockResponse } from "@/lib/billing";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const documents = await prisma.document.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ documents });
}

function detectFormat(filename: string, mimeType: string): DocumentSourceFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt") || mimeType === "text/plain") return "txt";
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const billingBlock = await billingBlockResponse(session.user.id);
  if (billingBlock) return billingBlock;

  const formData = await req.formData();
  const file = formData.get("file");
  const titleOverride = formData.get("title");
  const questionModeInput = formData.get("questionMode");
  const questionMode =
    questionModeInput === QuestionMode.Mcq ? QuestionMode.Mcq : QuestionMode.Open;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo del documento." }, { status: 400 });
  }

  const format = detectFormat(file.name, file.type);
  if (!format) {
    return NextResponse.json(
      { error: "Formato no admitido. Se aceptan archivos .txt, .pdf o .docx." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let pages;
  try {
    pages = await extractPages(buffer, format);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `No se pudo leer el archivo: ${err.message}`
            : "No se pudo leer el archivo.",
      },
      { status: 400 }
    );
  }

  let orderIndex = 0;
  const fragments: (TextFragment & { page: number })[] = [];
  for (const page of pages) {
    for (const f of fragmentLines(page.lines)) {
      fragments.push({ ...f, orderIndex: orderIndex++, page: page.pageNumber });
    }
  }

  if (fragments.length === 0) {
    return NextResponse.json({ error: "El archivo no tiene contenido de texto." }, { status: 400 });
  }

  const rawText = pages.map((p) => p.lines.join("\n")).join("\n\n");
  const documentId = randomUUID();

  await prisma.document.create({
    data: {
      id: documentId,
      ownerId: session.user.id,
      title: typeof titleOverride === "string" && titleOverride.trim() ? titleOverride : file.name,
      originalFilename: file.name,
      sourceFormat: format,
      rawText,
      status: DocumentStatus.Processing,
      questionMode,
    },
  });

  try {
    const fragmentsForQuestions = fragments.map((f) => ({ orderIndex: f.orderIndex, text: f.text }));
    const questions = await generateQuestions(fragmentsForQuestions, questionMode);
    backfillMissingQuestions(fragmentsForQuestions, questions);
    await verifyQuestionCorrespondence(fragmentsForQuestions, questions, questionMode);

    await prisma.$transaction([
      prisma.fragment.createMany({
        data: fragments.map((f) => {
          const generated = questions.get(f.orderIndex);
          return {
            documentId,
            orderIndex: f.orderIndex,
            page: f.page,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            text: f.text,
            question: generated?.question ?? null,
            options: generated?.options ? JSON.stringify(generated.options) : null,
            correctOptionIndex: generated?.correctOptionIndex ?? null,
          };
        }),
      }),
      prisma.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.Ready },
      }),
    ]);
  } catch (err) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.Failed,
        errorMessage: err instanceof Error ? err.message : "No se pudieron generar las preguntas.",
      },
    });
    return NextResponse.json(
      { error: "El documento se guardó, pero falló la generación de preguntas." },
      { status: 502 }
    );
  }

  const ready = await prisma.document.findUnique({ where: { id: documentId } });
  return NextResponse.json({ document: ready }, { status: 201 });
}
