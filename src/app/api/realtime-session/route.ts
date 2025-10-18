import { NextResponse } from "next/server";
import { MODELS, VAD_CONFIG } from "@/config/constants";
import type { RealtimeSessionResponse } from "@/types";

export async function GET() {
  const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELS.REALTIME,
      input_audio_transcription: { model: MODELS.TRANSCRIBE },
      turn_detection: VAD_CONFIG,
      instructions: "Transcribe only. Do not generate replies or audio.",
    }),
  });

  if (!r.ok) {
    const msg = await r.text();
    return NextResponse.json({ error: msg }, { status: r.status });
  }
  const data = await r.json() as RealtimeSessionResponse;
  return NextResponse.json({ client_secret: data.client_secret });
}
