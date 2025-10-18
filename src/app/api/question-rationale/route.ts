import { NextResponse } from "next/server";

/**
 * POST /api/question-rationale - Generate metacognitive rationale for why questions were formulated
 */
export async function POST(req: Request) {
  try {
    const { questions, transcript, cards } = await req.json();

    if (!questions || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: "Questions array is required" },
        { status: 400 }
      );
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Generate rationale for all questions
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert pedagogue analyzing why specific follow-up questions were formulated for an oral exam.

Your task is to provide metacognitive reasoning explaining the pedagogical intent behind each question.

For each question, explain:
1. What aspect of the student's presentation it targets
2. What deeper understanding it's trying to assess
3. How it connects to course concepts or the student's chosen cards
4. What intellectual move it asks the student to make

Be concise but insightful. Write 2-3 sentences per question.

IMPORTANT: Return ONLY a valid JSON array with no markdown formatting, no code blocks, no extra text.
Format: ["Rationale for Q1", "Rationale for Q2", "Rationale for Q3"]`
          },
          {
            role: "user",
            content: `Student's cards: ${cards.join(", ")}

Transcript excerpt: ${transcript.substring(0, 800)}

Questions formulated:
${questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n\n")}

Provide metacognitive rationale for why each question was formulated.`
          }
        ],
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate rationale" },
        { status: 500 }
      );
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content || "[]";
    
    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    // Parse the JSON response
    let rationales: string[];
    try {
      rationales = JSON.parse(content);
      
      // Ensure it's an array
      if (!Array.isArray(rationales)) {
        throw new Error("Response is not an array");
      }
    } catch (e) {
      console.error("Failed to parse rationales:", content);
      // If parsing fails, return empty rationales
      rationales = questions.map(() => "");
    }
    
    console.log("Parsed rationales:", rationales);
    return NextResponse.json({ rationales });
  } catch (error: any) {
    console.error("Error generating rationale:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate rationale" },
      { status: 500 }
    );
  }
}
