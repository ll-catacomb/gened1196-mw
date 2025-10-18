import { NextResponse } from "next/server";
import { fetchCardDefinitions, fetchAllCards } from "@/lib/airtable";

/**
 * GET /api/airtable/terms - Fetch all available cards
 */
export async function GET() {
  try {
    const cards = await fetchAllCards();
    return NextResponse.json({ cards });
  } catch (error: any) {
    console.error("Error fetching terms:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch terms" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/airtable/terms - Fetch definitions for specific cards
 */
export async function POST(req: Request) {
  try {
    const { cardNames } = await req.json();

    if (!Array.isArray(cardNames)) {
      return NextResponse.json(
        { error: "cardNames must be an array" },
        { status: 400 }
      );
    }

    const definitions = await fetchCardDefinitions(cardNames);
    return NextResponse.json({ definitions });
  } catch (error: any) {
    console.error("Error fetching term definitions:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch term definitions" },
      { status: 500 }
    );
  }
}
