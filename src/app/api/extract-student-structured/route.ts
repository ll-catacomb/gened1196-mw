import { NextResponse } from "next/server";
import { callChatCompletion } from "@/lib/huitOpenAI";
import { fetchAllCards } from "@/lib/airtable";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => []);

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[a.length][b.length];
}

function findLikelyCardsFromTranscript(
  transcript: string,
  knownCards: string[]
): string[] {
  if (!transcript || knownCards.length === 0) return [];

  const normalizedTranscript = normalize(transcript);
  const matches = new Set<string>();

  // Pass 1: direct inclusion of normalized names
  knownCards.forEach((card) => {
    const normalizedCard = normalize(card);
    if (!normalizedCard) return;

    if (
      normalizedTranscript.includes(` ${normalizedCard} `) ||
      normalizedTranscript.startsWith(`${normalizedCard} `) ||
      normalizedTranscript.endsWith(` ${normalizedCard}`) ||
      normalizedTranscript === normalizedCard
    ) {
      matches.add(card);
      return;
    }

    const tokens = normalizedCard.split(" ").filter(Boolean);
    if (
      tokens.length > 1 &&
      tokens.every((token) => normalizedTranscript.includes(token))
    ) {
      matches.add(card);
    }
  });

  // Pass 2: parse phrases after "cards" / "terms"
  const candidateSegmentMatch = transcript.match(
    /(cards?|terms?|topics?)\s*(?:were|are|include|included|drawn|chose|choosing|selected|i drew|i chose|=|:)\s*([^\n]+)/i
  );

  const candidatePhrases: string[] = [];
  if (candidateSegmentMatch?.[2]) {
    const segment = candidateSegmentMatch[2]
      .replace(/(?:(?:and|or)\s+)/gi, ",")
      .split(/[,/]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    candidatePhrases.push(...segment);
  }

  candidatePhrases.forEach((candidate) => {
    const normalizedCandidate = normalize(candidate);
    if (!normalizedCandidate) return;

    let bestCard = "";
    let bestScore = Number.POSITIVE_INFINITY;

    knownCards.forEach((card) => {
      const normalizedCard = normalize(card);
      if (!normalizedCard) return;

      const distance = levenshtein(normalizedCandidate, normalizedCard);
      const maxLen = Math.max(normalizedCandidate.length, normalizedCard.length);
      const normalizedDistance = distance / Math.max(maxLen, 1);

      if (normalizedDistance < bestScore) {
        bestScore = normalizedDistance;
        bestCard = card;
      }
    });

    if (bestCard && bestScore <= 0.35) {
      matches.add(bestCard);
    }
  });

  return Array.from(matches);
}

/**
 * POST /api/extract-student-structured
 * Extract student name and cards using OpenAI structured outputs
 */
export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing transcript" },
        { status: 400 }
      );
    }

    const cardRecords = await fetchAllCards();
    let validCardNames = cardRecords
      .map((record) => record.fields.card)
      .filter((name): name is string => Boolean(name));
    validCardNames = Array.from(new Set(validCardNames));

    if (validCardNames.length === 0) {
      validCardNames = [
        "Folklore",
        "Triviality",
        "Barrier",
        "Domestic Crafts",
        "Worldview",
        "Identity Statement",
        "Honor Pledge",
        "Murder Ballads",
        "Harvard Lore",
        "Waulking Songs",
        "Child Ballads",
        "Taylor Swift",
        "Structuralism",
        "Transmission",
        "Ethnopoetics",
        "Twin Laws",
        "Esoteric-Exoteric Factor",
        "Jokes",
        "Cards",
        "Ethnography",
        "Shanty Talk",
        "Folk Group",
        "Black Ash Basket Making",
        "Digital Folklore",
        "Authenticity",
        "Genre",
        "Decorated Mortarboards",
        "Meshworks",
      ];
    }

    const limitedCardList = validCardNames.slice(0, 200);

    const prompt = `Extract the student's name and the cards they selected from this transcript of an oral exam introduction.

The student will say something like: "My name is [Name] and I drew [card 1], [card 2], [card 3], and [card 4]."

Valid card names include: ${limitedCardList.join(", ")}

If you see a card name that's close but not exact (e.g., "walking songs" instead of "Waulking Songs"), use the correct spelling from the valid list.

Transcript:
${transcript}`;

    const response = await callChatCompletion({
      model: "gpt-4o-2024-08-06",
      messages: [
        {
          role: "system",
          content: "You are an expert at extracting structured information from student exam transcripts. Extract the student's name and the cards they selected. Return ONLY a JSON object with this exact format: {\"student_name\": \"...\", \"cards\": [\"...\", \"...\"]}"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `OpenAI request failed: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;

    if (!responseText) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    const extracted = JSON.parse(responseText);

    if (!extracted || !extracted.student_name) {
      return NextResponse.json(
        { error: "Failed to parse structured output" },
        { status: 500 }
      );
    }

    let cards: string[] = Array.isArray(extracted.cards)
      ? extracted.cards.filter(
          (card: unknown): card is string =>
            typeof card === "string" && card.trim().length > 0
        )
      : [];

    if (cards.length === 0) {
      cards = findLikelyCardsFromTranscript(transcript, validCardNames);
    }

    const uniqueCards = Array.from(new Set(cards));

    console.log("Extracted student info (structured):", {
      student_name: extracted.student_name,
      cards: uniqueCards,
    });

    return NextResponse.json({
      studentName: extracted.student_name,
      cards: uniqueCards,
    });
  } catch (error: any) {
    console.error("Error extracting student info:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to extract student info" },
      { status: 500 }
    );
  }
}
