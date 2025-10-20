import { NextResponse } from "next/server";
import type { WhisperTranscriptionResponse } from "@/types";
import { transcribeAudioFile } from "@/lib/transcribe";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Missing audio file" },
        { status: 400 }
      );
    }

    const result: WhisperTranscriptionResponse = await transcribeAudioFile(
      audioFile
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error?.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
