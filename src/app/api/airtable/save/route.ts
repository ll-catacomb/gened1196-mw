import { NextResponse } from "next/server";
import { saveTranscriptToAirtable, saveQuestionToAirtable } from "@/lib/airtable";
import type { AirtableTranscript, AirtableQuestion } from "@/types";

/**
 * POST /api/airtable/save - Save transcript and questions to Airtable
 * Saves to both Transcripts and Questions tables
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      studentName,
      studentCards,
      fullTranscript,
      questionsWithAnswers,
    } = body;

    if (!fullTranscript || !studentCards || !studentName) {
      return NextResponse.json(
        { error: "Missing required fields: fullTranscript, studentCards, studentName" },
        { status: 400 }
      );
    }

    // Save to Transcripts table
    const transcriptData: AirtableTranscript["fields"] = {
      transcript: fullTranscript,
      student_name: studentName,
      cards: Array.isArray(studentCards) ? studentCards.join(", ") : "", // Comma-separated card names
      timestamp: new Date().toISOString(),
      final_questions: questionsWithAnswers ? questionsWithAnswers.map((qa: any) => qa.question).join("\n\n") : "",
    };

    const transcriptResult = await saveTranscriptToAirtable(transcriptData);

    if (!transcriptResult) {
      return NextResponse.json(
        { error: "Failed to save transcript to Airtable" },
        { status: 500 }
      );
    }

    // Save questions with answers to Questions table
    const questionResults = [];
    const now = new Date().toISOString();

    console.log("Saving questions to Airtable:", {
      count: questionsWithAnswers?.length,
      questions: questionsWithAnswers
    });

    if (questionsWithAnswers && Array.isArray(questionsWithAnswers)) {
      for (let i = 0; i < questionsWithAnswers.length; i++) {
        const qa = questionsWithAnswers[i];
        const questionData: AirtableQuestion["fields"] = {
          text: qa.question,
          answer: qa.answer || "", // NEW: Include the answer
          generated_at: now,
          workflow: "judge", // Now safe as Long text field
          selected_final: true,
          card_tags: Array.isArray(studentCards) ? studentCards.join(", ") : "", // Convert to comma-separated string
        };
        
        console.log(`Saving question ${i + 1}:`, questionData);
        const result = await saveQuestionToAirtable(questionData);
        
        if (result) {
          console.log(`Question ${i + 1} saved successfully:`, result.id);
          questionResults.push(result);
        } else {
          console.error(`Question ${i + 1} failed to save`);
        }
      }
    }
    
    console.log("Question save results:", {
      attempted: questionsWithAnswers?.length,
      successful: questionResults.length,
      ids: questionResults.map(r => r.id)
    });

    return NextResponse.json({ 
      success: true, 
      transcriptId: transcriptResult.id,
      questionIds: questionResults.map(r => r.id)
    });
  } catch (error: any) {
    console.error("Error saving to Airtable:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save data" },
      { status: 500 }
    );
  }
}
