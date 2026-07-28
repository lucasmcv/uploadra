import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DocumentStatus, QuestionMode } from "@/lib/types";
import { fragmentText } from "@/lib/text-fragmentation";
import { backfillMissingQuestions, generateQuestions } from "@/lib/questions";

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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const titleOverride = formData.get("title");
  const questionModeInput = formData.get("questionMode");
  const questionMode =
    questionModeInput === QuestionMode.Mcq ? QuestionMode.Mcq : QuestionMode.Open;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo de texto." }, { status: 400 });
  }

  const isTxt = file.name.toLowerCase().endsWith(".txt") || file.type === "text/plain";
  if (!isTxt) {
    return NextResponse.json(
      { error: "Por ahora solo se admiten archivos .txt (PDF/DOCX próximamente)." },
      { status: 400 }
    );
  }

  const rawText = await file.text();
  const fragments = fragmentText(rawText);

  if (fragments.length === 0) {
    return NextResponse.json({ error: "El archivo no tiene contenido de texto." }, { status: 400 });
  }

  const documentId = randomUUID();

  await prisma.document.create({
    data: {
      id: documentId,
      ownerId: session.user.id,
      title: typeof titleOverride === "string" && titleOverride.trim() ? titleOverride : file.name,
      originalFilename: file.name,
      sourceFormat: "txt",
      rawText,
      status: DocumentStatus.Processing,
      questionMode,
    },
  });

  try {
    const fragmentsForQuestions = fragments.map((f) => ({ orderIndex: f.orderIndex, text: f.text }));
    const questions = await generateQuestions(fragmentsForQuestions, questionMode);
    backfillMissingQuestions(fragmentsForQuestions, questions);

    await prisma.$transaction([
      prisma.fragment.createMany({
        data: fragments.map((f) => {
          const generated = questions.get(f.orderIndex);
          return {
            documentId,
            orderIndex: f.orderIndex,
            page: 1,
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
