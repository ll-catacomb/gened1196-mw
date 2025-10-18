import { NextResponse } from "next/server";
import { MODELS, TIMEOUTS } from "@/config/constants";
import type { FinalQuestionRequest, FinalQuestionResponse } from "@/types";

// Embed the syllabus server-side so you don't ship it from the client each time.
const SYLLABUS = `

Course Goals
Upon completing this course, you should be able to:
- Understand folklore and tradition not just as a remnant of the past but as innovations and continuations of the past, and an emergent phenomenon created and recreated by people in their daily lives, even in the most “modern” societies;
- Appreciate differences of aesthetic expression, notions of artfulness and expertise, and kinds of knowledge;
- Articulate the rhetorical and ideological work done by different uses of tradition;
- Identify and understand how informal traditions work both within and against formal structures of knowledge and power;
- Nuance the entanglements between ‘pop’ culture, ‘high’ culture, and ‘folk’ culture;
- Explore expression in everyday life using (1) the basics of ethnographic documentation, (2) varied genres of expression (speech, writing, performance), and (3) intellectual tools for communicating the meanings of tradition, folklore, heritage, and the politics of culture;
- Better account for your own role in a world of entangled groups of all kinds – ethnic, religious, age-based, place-based, etc.;
- Understand and communicate the stakes of informal, traditional expression in your own life path and the lives of others.



Marks are being assigned as follows:

A
- Demonstrates exceptional conceptual mastery of key ideas, theories, or case studies are clearly understood and accurately represented.
- Integrates concepts fluidly into a coherent, original narrative that shows deep understanding of how they interrelate across categories.
- Makes insightful connections that go beyond surface associations, showing critical engagement and creative synthesis.
- Maintains logical flow and clarity throughout the transcript; ideas build naturally from one another.

A-
- Demonstrates strong understanding of all concepts and uses them effectively to build a mostly cohesive narrative.
- Shows meaningful synthesis, though a few connections could be more fully developed.
- Clear and well-organized transcript with minor lapses in coherence or precision.
- Meets time requirement (4–6 minutes) and adheres fully to process guidelines (e.g., number and distribution of cards).

B+
- Demonstrates solid comprehension of most concepts but with minor inaccuracies or oversimplifications.
- Narrative is thoughtful but uneven—some sections connect ideas well while others remain underdeveloped.
- Reasonable clarity and organization, with occasional digressions or gaps in logical flow.
- Shows awareness of how ideas could connect but doesn’t fully explore implications or contrasts.

B
- Demonstrates adequate understanding of core concepts, but some are misrepresented or treated superficially.
- Narrative shows effort to connect cards but relies on listing or loosely associating rather than synthesizing.
- Transcript has uneven organization and moments of unclear reasoning.


B-
- Demonstrates partial comprehension; key terms or theories are used inaccurately or without clear context.
- Narrative structure is disjointed, making conceptual relationships hard to follow.
- Limited synthesis; ideas appear side-by-side rather than in dialogue.

C
- Demonstrates minimal understanding of key concepts; frequent inaccuracies or omissions.
- Narrative is fragmented or primarily descriptive, showing little analysis or integration.
- Transcript lacks coherence and flow; difficult to follow intellectual thread.

D
- Demonstrates little or no grasp of the course’s central concepts or their interrelations.
- Transcript is extremely unclear or incomplete.
- Lacks logical structure, synthesis, or accurate terminology.
`;

export async function POST(req: Request) {
  try {
    const { transcript, allQuestions, scope } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "Missing 'transcript'." }, { status: 400 });
    }
    if (!allQuestions || typeof allQuestions !== "string") {
      return NextResponse.json({ error: "Missing 'allQuestions'." }, { status: 400 });
    }
    // scope: "first2_5" or "full" (optional, just for the prompt context)
    const label = scope === "first2_5" ? "FIRST 2.5 MINUTES" : "FULL SESSION";

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), TIMEOUTS.FINAL_QUESTIONS);

    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODELS.CHAT,
          messages: [
            {
              role: "system",
              content:
                "You are a rigorous professor listening to a student presenting their oral exam. Using the syllabus, a transcript of the student's presentation, and follow-up questions that listeners have had thus far, produce EXACTLY three final, on-topic follow-up questions (plain text, one per line, no numbering) that probe areas the student may not have elaborated adequately.",
            },
            {
              role: "user",
              content:
                `SCOPE: ${label}\n\n` +
                `This is the syllabus of the course that you are teaching:\n${SYLLABUS}\n\n` +
                `CHECKPOINT QUESTIONS SO FAR:\n${allQuestions}\n\n` +
                `TRANSCRIPT OF ORAL PRESENTATION (${label}):\n${transcript}\n\n` +
                `TASK: Write ONLY three on-topic follow-up questions that:\n` +
                `- avoid off-topic tangents; do not ask for connections to other topics in the syllabus that the student has not discussed. \n` +
                `- target gaps, under-defined terms, weak links, or missing contrasts;\n` +
                `- make sure that you are not asking the student to reiterate something they've already discussed; make sure that you're asking about a gap or something they have not yet addressed;\n` +
                `- are not yes/no; each on its own line with no numbering or extra text.`,
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
