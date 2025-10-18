/**
 * Airtable API utilities
 */

import type { AirtableCard, AirtableTranscript, AirtableQuestion } from "@/types";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE || "Cards";
const TRANSCRIPTS_TABLE = process.env.AIRTABLE_TRANSCRIPTS_TABLE || "Transcripts";
const QUESTIONS_TABLE = process.env.AIRTABLE_QUESTIONS_TABLE || "Questions";

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

/**
 * Fetch card definitions from Airtable
 * @param cardNames - Array of card names to fetch
 * @returns Map of card names to their descriptions
 */
export async function fetchCardDefinitions(
  cardNames: string[]
): Promise<Record<string, string>> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured, returning empty definitions");
    return {};
  }

  try {
    // Build filter formula to match any of the card names
    const filterFormula = `OR(${cardNames.map((name) => `{card}="${name}"`).join(",")})`;

    const url = new URL(`${BASE_URL}/${CARDS_TABLE}`);
    url.searchParams.set("filterByFormula", filterFormula);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.statusText}`);
    }

    const data = await response.json();
    const records = data.records as AirtableCard[];

    // Convert to map of card name -> description
    const definitions: Record<string, string> = {};
    records.forEach((record) => {
      definitions[record.fields.card] = record.fields.description;
    });

    return definitions;
  } catch (error) {
    console.error("Error fetching card definitions:", error);
    return {};
  }
}

/**
 * Save transcript and questions to Airtable
 */
export async function saveTranscriptToAirtable(
  data: AirtableTranscript["fields"]
): Promise<{ id: string } | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured, skipping save");
    return null;
  }

  try {
    const response = await fetch(`${BASE_URL}/${TRANSCRIPTS_TABLE}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: data,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Airtable API error details:", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        sentData: data
      });
      throw new Error(`Airtable API error: ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    return { id: result.id };
  } catch (error) {
    console.error("Error saving to Airtable:", error);
    return null;
  }
}

/**
 * Fetch all available cards from Airtable
 * @returns Array of card objects
 */
export async function fetchAllCards(): Promise<AirtableCard[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured");
    return [];
  }

  try {
    const response = await fetch(`${BASE_URL}/${CARDS_TABLE}`, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.records as AirtableCard[];
  } catch (error) {
    console.error("Error fetching cards:", error);
    return [];
  }
}

/**
 * Save a question to Airtable Questions table
 */
export async function saveQuestionToAirtable(
  data: AirtableQuestion["fields"]
): Promise<{ id: string } | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured, skipping save");
    return null;
  }

  try {
    const response = await fetch(`${BASE_URL}/${QUESTIONS_TABLE}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: data,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("❌ Airtable API error details (Questions):", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        sentData: data
      });
      
      // Parse the error to show what field is the problem
      try {
        const errorJson = JSON.parse(errorBody);
        console.error("❌ Specific error:", errorJson.error);
      } catch (e) {
        // Error body wasn't JSON
      }
      
      throw new Error(`Airtable API error: ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    console.log("✅ Question saved successfully:", result.id);
    return { id: result.id };
  } catch (error) {
    console.error("❌ Error saving question to Airtable:", error);
    return null;
  }
}
