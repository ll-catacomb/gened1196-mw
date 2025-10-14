import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { questions, transcript, scope } = await req.json();

    if (!questions || typeof questions !== "string") {
      return NextResponse.json({ error: "Missing 'questions'." }, { status: 400 });
    }
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "Missing 'transcript'." }, { status: 400 });
    }

    const label = scope === "first2_5" ? "FIRST 2.5 MINUTES" : "FULL SESSION";

    // If there are 3 or fewer lines already, just return them (fast path).
    const lines = questions
      .split("\n")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (lines.length <= 3) {
      return NextResponse.json({ top: lines.join("\n") });
    }

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 15_000);

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
                "You are a strict judge deciding on the best follow-up questions to an oral exam. From a list of candidate questions (one per line), pick EXACTLY three that are most diagnostic, non-overlapping, and on-topic given the transcript. Prioritize follow-up questions that ask the student to elaborate, and that do not cover details that the student has already discussed. Return the chosen questions VERBATIM, one per line, no numbering or extra text.",
            },
            {
              role: "user",
              content:
                `SCOPE: ${label}\n\n` +
                `TRANSCRIPT (${label}):\n${transcript}\n\n` +
                `CANDIDATE QUESTIONS (one per line):\n${questions}\n\n` +
                `TASK: Return ONLY three questions from the list above, verbatim, one per line.`,
            },
          ],
        }),
        signal: ac.signal,
      });

      if (!r.ok) {
        const msg = await r.text();
        return NextResponse.json({ error: msg }, { status: r.status });
      }
      const data = await r.json();
      const top = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
      return NextResponse.json({ top });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Upstream model timed out" : e?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
