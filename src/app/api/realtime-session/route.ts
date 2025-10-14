// app/api/realtime-session/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-realtime", // or your chosen realtime model
      input_audio_transcription: { model: "gpt-4o-transcribe" }, // or gpt-4o-mini-transcribe / whisper-1
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        silence_duration_ms: 500,
        create_response: false,          // ⬅️ HARD OFF: don’t auto-create responses
      },
      instructions: "Transcribe only. Do not generate replies or audio.",
    }),
  });

  if (!r.ok) {
    const msg = await r.text();
    return NextResponse.json({ error: msg }, { status: r.status });
  }
  const data = await r.json();
  return NextResponse.json({ client_secret: data.client_secret });
}
