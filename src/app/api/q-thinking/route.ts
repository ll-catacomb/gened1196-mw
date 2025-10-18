import { NextResponse } from "next/server";
import { MODELS, TIMEOUTS } from "@/config/constants";
import type { ThinkingQuestionRequest, ThinkingQuestionResponse } from "@/types";

// Embed the syllabus server-side
const SYLLABUS = `
Course Goals
Upon completing this course, you should be able to:
- Understand folklore and tradition not just as a remnant of the past but as innovations and continuations of the past, and an emergent phenomenon created and recreated by people in their daily lives, even in the most "modern" societies;
- Appreciate differences of aesthetic expression, notions of artfulness and expertise, and kinds of knowledge;
- Articulate the rhetorical and ideological work done by different uses of tradition;
- Identify and understand how informal traditions work both within and against formal structures of knowledge and power;
- Nuance the entanglements between 'pop' culture, 'high' culture, and 'folk' culture;
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
- Shows awareness of how ideas could connect but doesn't fully explore implications or contrasts.

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
- Demonstrates little or no grasp of the course's central concepts or their interrelations.
- Transcript is extremely unclear or incomplete.
- Lacks logical structure, synthesis, or accurate terminology.
`;

export async function POST(req: Request) {
  try {
    const body: ThinkingQuestionRequest = await req.json();
    const { transcript, studentTerms, termDefinitions, scope } = body;

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Missing 'transcript'" },
        { status: 400 }
      );
    }

    const label = scope === "first2_5" ? "FIRST 2.5 MINUTES" : "FULL SESSION";

    // Build context about student's selected terms
    const termsContext = studentTerms
      .map((term) => {
        const def = termDefinitions[term];
        return def ? `- ${term}: ${def}` : `- ${term}`;
      })
      .join("\n");

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), TIMEOUTS.FINAL_QUESTIONS);

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODELS.THINKING,
            messages: [
              {
                role: "system",
                content: `You are a rigorous professor evaluating a student's oral exam presentation. Your task is to generate EXACTLY THREE follow-up questions that help the student demonstrate their understanding and align with the grading rubric.

QUESTION STRATEGY:
1. Questions 1-2 should be SCAFFOLDING questions that help the student align with the rubric. If the student understands a concept but failed to articulate key ideas, specific terminology, or important details (perhaps due to nerves), these questions should provide a platform for them to elaborate. These should NOT give away answers but should feel like opportunities to demonstrate knowledge.

2. Question 3 should be a STRETCH GOAL - more challenging but in the area where the student showed the most competence. This should allow them to go deeper and demonstrate advanced understanding, aligned with the rubric and syllabus.

CRITICAL: DO NOT mention specific scholars or authors by name UNLESS they are absolutely foundational to the field (e.g., Claude Lévi-Strauss, Clifford Geertz). For niche topics or specialized cards, avoid citing obscure scholars the student may not have encountered. Focus on concepts, frameworks, and theoretical approaches rather than names.

Return ONLY three questions, one per line, no numbering or preamble.`,
              },
              {
                role: "user",
                content: `SCOPE: ${label}

SYLLABUS:
${SYLLABUS}

STUDENT'S SELECTED TERMS/CARDS:
${termsContext || "(No terms provided)"}

TRANSCRIPT (${label}):
${transcript}

TASK: Generate EXACTLY three follow-up questions following the strategy:
- Q1-2: Scaffolding questions that help the student demonstrate knowledge they may have but didn't fully articulate. Look for gaps where they understand concepts but missed specific examples, important terminology, or theoretical connections. These should feel supportive but not give away answers.
- Q3: A stretch goal in their strongest area - challenge them to go deeper where they showed competence.

REMEMBER: Avoid mentioning obscure scholars by name. Focus on concepts, frameworks, and theoretical approaches.

Return ONLY the three questions, one per line, no numbering.`,
              },
            ],
          }),
          signal: ac.signal,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: `OpenAI API error: ${errorText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      const questions = data?.choices?.[0]?.message?.content?.trim?.() ?? "";

      const result: ThinkingQuestionResponse = { questions };
      return NextResponse.json(result);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    const msg =
      error?.name === "AbortError"
        ? "Request timed out"
        : error?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
