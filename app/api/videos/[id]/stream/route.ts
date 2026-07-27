import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.ownerId !== session.user.id) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const storage = getStorageDriver();

  const presignedUrl = await storage.getPresignedGetUrl(video.storageKey);
  if (presignedUrl) {
    return NextResponse.redirect(presignedUrl);
  }

  const size = await storage.getObjectSize(video.storageKey);
  const rangeHeader = req.headers.get("range");

  if (!rangeHeader) {
    const stream = await storage.getObjectStream(video.storageKey);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": video.mimeType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  const chunkSize = end - start + 1;

  const stream = await storage.getObjectStream(video.storageKey, { start, end });
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      "Content-Type": video.mimeType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}
