/**
 * Airtable API utilities
 */

import type { AirtableCard, AirtableTranscript, AirtableQuestion, AirtableExam } from "@/types";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const CARDS_TABLE = process.env.AIRTABLE_CARDS_TABLE || "Cards";
const TRANSCRIPTS_TABLE = process.env.AIRTABLE_TRANSCRIPTS_TABLE || "Transcripts";
const QUESTIONS_TABLE = process.env.AIRTABLE_QUESTIONS_TABLE || "Questions";
const EXAMS_TABLE = process.env.AIRTABLE_EXAMS_TABLE || "Exams";

const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const CARD_CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes

let cachedCards: AirtableCard[] | null = null;
let cachedDefinitions: Record<string, string> | null = null;
let cardsFetchedAt = 0;

function buildDefinitionMap(records: AirtableCard[]): Record<string, string> {
  const definitions: Record<string, string> = {};
  records.forEach((record) => {
    const name = record.fields.card;
    if (!name) return;
    definitions[name] = record.fields.description || "";
  });
  return definitions;
}

async function loadCardsFromAirtable(): Promise<AirtableCard[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured");
    return [];
  }

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
}

async function getCachedCards(forceRefresh = false): Promise<AirtableCard[]> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured");
    return [];
  }

  const now = Date.now();
  if (
    !forceRefresh &&
    cachedCards &&
    now - cardsFetchedAt < CARD_CACHE_TTL_MS
  ) {
    if (!cachedDefinitions) {
      cachedDefinitions = buildDefinitionMap(cachedCards);
    }
    return cachedCards;
  }

  try {
    const records = await loadCardsFromAirtable();
    cachedCards = records;
    cachedDefinitions = buildDefinitionMap(records);
    cardsFetchedAt = Date.now();
    return records;
  } catch (error) {
    console.error("Error refreshing Airtable card cache:", error);
    if (cachedCards) {
      return cachedCards;
    }
    return [];
  }
}

/**
 * Fetch card definitions from Airtable
 * @param cardNames - Array of card names to fetch
 * @returns Map of card names to their descriptions
 */
export async function fetchCardDefinitions(
  cardNames: string[]
): Promise<Record<string, string>> {
  const normalizedNames = cardNames
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name));

  if (normalizedNames.length === 0) {
    return {};
  }

  const cards = await getCachedCards();
  const definitions = cachedDefinitions ?? buildDefinitionMap(cards);

  const result: Record<string, string> = {};
  const missing: string[] = [];

  normalizedNames.forEach((name) => {
    const definition = definitions[name];
    if (definition !== undefined) {
      result[name] = definition;
    } else {
      missing.push(name);
    }
  });

  if (missing.length > 0) {
    const refreshedCards = await getCachedCards(true);
    const refreshedDefinitions =
      cachedDefinitions ?? buildDefinitionMap(refreshedCards);

    missing.forEach((name) => {
      const definition = refreshedDefinitions[name];
      if (definition !== undefined) {
        result[name] = definition;
      }
    });
  }

  return result;
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
  return getCachedCards();
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

/**
 * Save exam metadata to Airtable Exams table
 */
export async function saveExamToAirtable(
  data: AirtableExam["fields"]
): Promise<{ id: string } | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.warn("Airtable not configured, skipping save");
    return null;
  }

  try {
    const response = await fetch(`${BASE_URL}/${EXAMS_TABLE}`, {
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
      console.error("❌ Airtable API error details (Exams):", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        sentData: data
      });

      throw new Error(`Airtable API error: ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    console.log("✅ Exam saved successfully:", result.id);
    return { id: result.id };
  } catch (error) {
    console.error("❌ Error saving exam to Airtable:", error);
    return null;
  }
}
