import { NextResponse } from "next/server";
import { callChatCompletion } from "@/lib/huitOpenAI";

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

    // Use GPT to extract structured data
    const response = await callChatCompletion({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You extract student information from oral exam transcripts.

The student says: "My name is [Name], and my cards are [Card1], [Card2], [Card3]..."

Your job:
1. Find the student's full name
2. Find the card names they list (usually 3-6 cards)
3. Return ONLY a simple JSON object with two fields

VALID CARD NAMES (fix transcription errors to match these):
Folklore, Triviality, Barrier, Domestic Crafts, Worldview, Identity Statement, Honor Pledge, Murder Ballads, Harvard Lore, Waulking Songs, Child Ballads, Taylor Swift, Structuralism, Transmission, Ethnopoetics, Twin Laws, Esoteric-Exoteric Factor, Jokes, Cards, Ethnography, Shanty Talk, Folk Group, Black Ash Basket Making, Digital Folklore, Authenticity, Genre, Decorated Mortarboards, Meshworks

CRITICAL: Look at what the student actually says after "my cards are" and extract those card names!

Return this exact format with NO markdown, NO code blocks:
{"studentName": "Full Name", "cardString": "Card1, Card2, Card3"}`,
          },
          {
            role: "user",
            content: `Transcript: "${transcript.substring(0, 500)}"

Extract the student name and cards. Return JSON only.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
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
    let content = data.choices[0]?.message?.content || "{}";
    
    console.log("Raw LLM response:", content);
    
    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    // Parse the JSON response
    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse extraction response:", content);
      return NextResponse.json({
        studentName: "Unknown Student",
        cards: []
      });
    }
    
    console.log("Extracted data:", extracted);
    
    // Convert cardString to array
    let cardsArray = [];
    if (extracted.cardString && typeof extracted.cardString === 'string') {
      cardsArray = extracted.cardString.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    } else if (extracted.cards && Array.isArray(extracted.cards)) {
      cardsArray = extracted.cards;
    }
    
    return NextResponse.json({
      studentName: extracted.studentName || "Unknown Student",
      cards: cardsArray
    });
  } catch (error: any) {
    console.error("Error extracting student info:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to extract student info" },
      { status: 500 }
    );
  }
}
