import { NextResponse } from "next/server";
import { MODELS, TIMEOUTS } from "@/config/constants";
import type { BasicQuestionRequest, BasicQuestionResponse } from "@/types";
import { callChatCompletion } from "@/lib/huitOpenAI";

export async function POST(req: Request) {
  try {
    const { text, tSec } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text'." }, { status: 400 });
    }

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), TIMEOUTS.CHECKPOINT_QUESTIONS);
    try {
      const r = await callChatCompletion(
        {
          model: MODELS.CHAT,
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
        },
        "/chat/completions",
        { signal: ac.signal }
      );

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
