import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { text, tSec } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text'." }, { status: 400 });
    }

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 150_000);
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "o3-2025-04-16",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful teaching assistant, listening to a student delivering their oral exam. . Given a transcript, write EXACTLY three short, basic, on-topic follow-up questions as plain text, based on what student has presented thus far. One per line. No numbering, no preamble, no extra text.",
            },
            {
              role: "user",
              content:
                `Cumulative transcript up to T+${tSec ?? "?"}s:\n\n` +
                text +
                `\n\nReturn ONLY three short, basic, on-topic follow-up questions, each on its own line.`,
            },
          ],
        }),
        signal: ac.signal,
      });

      if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
      const data = await r.json();
      const questions = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
      return NextResponse.json({ questions });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Upstream model timed out" : e?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
