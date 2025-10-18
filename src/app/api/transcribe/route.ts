import { NextResponse } from "next/server";
import { MODELS } from "@/config/constants";
import type { WhisperTranscriptionResponse } from "@/types";

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

    // Create form data for OpenAI Whisper API
    const whisperFormData = new FormData();
    whisperFormData.append("file", audioFile);
    whisperFormData.append("model", MODELS.WHISPER);
    whisperFormData.append("response_format", "json");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: whisperFormData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Whisper API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const result: WhisperTranscriptionResponse = {
      text: data.text || "",
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: error?.message || "Transcription failed" },
      { status: 500 }
    );
  }
}
