import { NextResponse } from "next/server";
import { MODELS, TIMEOUTS } from "@/config/constants";
import type { FinalJudgeRequest, FinalJudgeResponse } from "@/types";
import { callChatCompletion } from "@/lib/huitOpenAI";

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

Grading Rubric (A to D):
A: Exceptional conceptual mastery, fluid integration, insightful connections, logical flow
A-: Strong understanding, meaningful synthesis, clear organization
B+: Solid comprehension with minor gaps, thoughtful but uneven narrative
B: Adequate understanding, effort to connect but superficial synthesis
B-: Partial comprehension, disjointed structure, limited synthesis
C: Minimal understanding, fragmented narrative, lacks coherence
D: Little/no grasp of concepts, unclear/incomplete
`;

export async function POST(req: Request) {
  try {
    const body: FinalJudgeRequest = await req.json();
    const {
      realtimeQuestions,
      recordingQuestions,
      transcript,
      studentTerms,
      termDefinitions,
    } = body;

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Missing 'transcript'" },
        { status: 400 }
      );
    }

    // Build context about student's selected terms
    const termsContext = studentTerms
      ?.map((term) => {
        const def = termDefinitions?.[term];
        return def ? `- ${term}: ${def}` : `- ${term}`;
      })
      .join("\n") || "(No terms provided)";

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), TIMEOUTS.FINAL_QUESTIONS);

    try {
      const response = await callChatCompletion(
        {
          model: MODELS.THINKING,
          messages: [
            {
              role: "system",
              content: `You are a master educator synthesizing insights from two different question-generation approaches (real-time and recording-based) to produce the optimal final three questions for a student's oral exam.

CRITICAL QUESTION STRATEGY:
Your final three questions must follow this precise structure:

QUESTION 1 (Scaffolding - Rubric Alignment):
- Identify where the student shows understanding but missed key details (authors, specific terminology, examples)
- Create a supportive platform for them to demonstrate this knowledge
- Should feel like an opportunity, not a quiz
- Must NOT give away the answer

QUESTION 2 (Scaffolding - Gap Filling):
- Find conceptual gaps or underdeveloped connections in their presentation
- Help them articulate relationships between ideas they touched on but didn't fully explore
- Should guide them toward rubric criteria they haven't fully demonstrated

QUESTION 3 (Stretch Goal):
- Identify their STRONGEST area of competence from the presentation
- Challenge them to go deeper, make novel connections, or apply concepts in new ways
- Should be appropriately challenging but achievable based on what they've shown
- Aligned with A/A- level rubric criteria

SYNTHESIS APPROACH:
- Compare both sets of questions (realtime vs recording-based)
- Select the best elements from each
- Ensure questions are non-overlapping and complementary
- Prioritize questions that align with the grading rubric
- Consider the student's selected terms and how well they've integrated them

Return ONLY three questions, one per line, no numbering or explanation.`,
              },
              {
                role: "user",
                content: `SYLLABUS & RUBRIC:
${SYLLABUS}

STUDENT'S SELECTED TERMS/CARDS:
${termsContext}

FULL TRANSCRIPT:
${transcript}

QUESTIONS FROM REAL-TIME WORKFLOW:
${realtimeQuestions || "(None generated)"}

QUESTIONS FROM RECORDING WORKFLOW:
${recordingQuestions || "(None generated)"}

TASK: Synthesize the best insights from both question sets to produce EXACTLY THREE final questions that:
1. Question 1: Scaffolding - help align with rubric by addressing missed details (authors, terms, examples)
2. Question 2: Scaffolding - fill conceptual gaps or underdeveloped connections
3. Question 3: Stretch goal in their strongest area

These questions should work together as a cohesive set to help the student demonstrate their full understanding.

Return ONLY the three final questions, one per line, no numbering or preamble.`,
            },
          ],
        },
        "/chat/completions",
        { signal: ac.signal }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: `OpenAI API error: ${errorText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      const finalQuestions =
        data?.choices?.[0]?.message?.content?.trim?.() ?? "";

      const result: FinalJudgeResponse = {
        finalQuestions,
      };

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
