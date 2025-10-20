import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { transcribeAudioFile } from "@/lib/transcribe";

export const runtime = "nodejs";

const RECORDINGS_DIR = path.join(process.cwd(), "recordings");

function sanitizeSegment(segment: string) {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "recording";
}

function detectExtension(file: File) {
  const explicitName = file.name?.split(".").pop();
  if (explicitName && explicitName.length <= 5) {
    return explicitName.toLowerCase();
  }
  if (file.type === "audio/webm" || file.type === "audio/webm;codecs=opus") {
    return "webm";
  }
  if (file.type === "audio/ogg") {
    return "ogg";
  }
  if (file.type === "audio/mpeg") {
    return "mp3";
  }
  if (file.type === "audio/wav") {
    return "wav";
  }
  return "dat";
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const context = formData.get("context")?.toString() ?? "recording";
    const transcribeFlag = formData.get("transcribe");
    const shouldTranscribe =
      typeof transcribeFlag === "string"
        ? ["true", "1", "yes", "on"].includes(transcribeFlag.toLowerCase())
        : false;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Missing audio file" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const ext = detectExtension(audioFile);
    const safeContext = sanitizeSegment(context);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const randomSuffix = randomBytes(4).toString("hex");
    const fileName = `${timestamp}_${safeContext}_${randomSuffix}.${ext}`;
    const filePath = path.join(RECORDINGS_DIR, fileName);

    await mkdir(RECORDINGS_DIR, { recursive: true });
    await writeFile(filePath, buffer);

    let transcript: string | null = null;

    if (shouldTranscribe) {
      try {
        const transcription = await transcribeAudioFile(audioFile);
        transcript = transcription.text || "";
      } catch (error) {
        console.error("Transcription during persistence failed:", error);
      }
    }

    return NextResponse.json({
      success: true,
      fileName,
      relativePath: path.relative(process.cwd(), filePath),
      transcript,
    });
  } catch (error: any) {
    console.error("Error persisting recording:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to persist recording" },
      { status: 500 }
    );
  }
}
