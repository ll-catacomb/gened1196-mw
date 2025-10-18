import { NextResponse } from "next/server";

/**
 * POST /api/extract-cards - Use LLM to extract student name and card names from transcript
 */
export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript is required" },
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

    // Use GPT to extract structured data
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
            content: `You are a helpful assistant that extracts student information from oral exam transcripts.
The student states their name followed by 3-6 card/term names at the beginning of their presentation.
Extract the student's full name and the list of card names they mentioned.
Return ONLY valid JSON with this exact format:
{
  "studentName": "First Last",
  "cards": ["Card1", "Card2", "Card3"]
}

IMPORTANT: Match card names to these exact terms (fix transcription errors):
- Folklore
- Triviality
- Barrier
- Domestic Crafts (NOT "domestic graphs")
- Worldview
- Identity Statement
- Honor Pledge
- Murder Ballads (NOT "rubber ballots")
- Harvard Lore
- Waulking Songs (NOT "walking songs")
- Child Ballads
- Taylor Swift

Fix transcription errors to match the correct card names above.`
          },
          {
            role: "user",
            content: `Extract the student name and card names from this transcript:\n\n${transcript.substring(0, 500)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json(
        { error: "Failed to extract student info" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "{}";
    
    // Parse the JSON response
    const extracted = JSON.parse(content);
    
    return NextResponse.json({
      studentName: extracted.studentName || "Unknown Student",
      cards: extracted.cards || []
    });
  } catch (error: any) {
    console.error("Error extracting student info:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to extract student info" },
      { status: 500 }
    );
  }
}
