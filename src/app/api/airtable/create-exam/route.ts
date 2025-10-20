import { NextResponse } from "next/server";
import { saveExamToAirtable } from "@/lib/airtable";
import type { AirtableExam } from "@/types";

const EXAMS_CARDS_FIELD = process.env.AIRTABLE_EXAMS_CARDS_FIELD || "cards";
const EXAMS_TIMESTAMP_FIELD =
  process.env.AIRTABLE_EXAMS_TIMESTAMP_FIELD || "timestamp";
const EXAMS_NAME_RECORDING_FIELD =
  process.env.AIRTABLE_EXAMS_NAME_RECORDING_FIELD;

/**
 * POST /api/airtable/create-exam - Create exam record in Airtable
 * Creates a new record in the Exams table with metadata
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      sessionId,
      studentName,
      cards,
      timestamp,
      nameCardsRecording,
    } = body;

    if (!sessionId || !studentName || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, studentName, timestamp" },
        { status: 400 }
      );
    }

    // Save to Exams table
    const cardsString = Array.isArray(cards)
      ? cards.join(", ")
      : typeof cards === "string"
        ? cards
        : "";

    const examData: Record<string, string> = {
      session_id: sessionId,
      student_name: studentName,
    };

    if (cardsString) {
      examData[EXAMS_CARDS_FIELD] = cardsString;
    }

    if (timestamp && EXAMS_TIMESTAMP_FIELD) {
      examData[EXAMS_TIMESTAMP_FIELD] = timestamp;
    }

    if (nameCardsRecording && EXAMS_NAME_RECORDING_FIELD) {
      examData[EXAMS_NAME_RECORDING_FIELD] = nameCardsRecording;
    }

    console.log("Saving exam to Airtable:", examData);

    const examResult = await saveExamToAirtable(
      examData as AirtableExam["fields"]
    );

    if (!examResult) {
      return NextResponse.json(
        { error: "Failed to save exam to Airtable" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: examResult.id,
    });
  } catch (error: any) {
    console.error("Error creating exam record:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create exam record" },
      { status: 500 }
    );
  }
}
