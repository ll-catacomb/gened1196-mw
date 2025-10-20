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
      recordingFiles,
    } = body;

    if (!fullTranscript || !studentCards || !studentName) {
      return NextResponse.json(
        { error: "Missing required fields: fullTranscript, studentCards, studentName" },
        { status: 400 }
      );
    }

    // Save to Transcripts table
    const cardsString = Array.isArray(studentCards) ? studentCards.join(", ") : (typeof studentCards === 'string' ? studentCards : "");
    
    console.log("Preparing transcript data:", {
      studentName,
      studentCards,
      cardsString,
      isArray: Array.isArray(studentCards),
      recordingFiles,
    });
    
    const transcriptData: AirtableTranscript["fields"] = {
      transcript: fullTranscript,
      student_name: studentName,
      cards: cardsString, // Comma-separated card names
      timestamp: new Date().toISOString(),
      final_questions: questionsWithAnswers ? questionsWithAnswers.map((qa: any) => qa.question).join("\n\n") : "",
    };
    
    console.log("Saving transcript to Airtable:", transcriptData);

    const transcriptResult = await saveTranscriptToAirtable(transcriptData);

    if (!transcriptResult) {
      return NextResponse.json(
        { error: "Failed to save transcript to Airtable" },
        { status: 500 }
      );
    }

    // Generate rationales for questions (async, after questions are formulated)
    let rationales: string[] = [];
    try {
      const rationaleResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/question-rationale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: questionsWithAnswers?.map((qa: any) => qa.question) || [],
          transcript: fullTranscript,
          cards: studentCards
        }),
      });
      
      if (rationaleResponse.ok) {
        const rationaleData = await rationaleResponse.json();
        rationales = rationaleData.rationales || [];
        console.log("Generated rationales:", rationales);
      }
    } catch (error) {
      console.error("Error generating rationales:", error);
      // Continue without rationales if generation fails
    }

    // Save questions with answers to Questions table
    const questionResults = [];
    const now = new Date().toISOString();

    console.log("Saving questions to Airtable:", {
      count: questionsWithAnswers?.length,
      questions: questionsWithAnswers,
      recordingFiles,
    });

    if (questionsWithAnswers && Array.isArray(questionsWithAnswers)) {
      for (let i = 0; i < questionsWithAnswers.length; i++) {
        const qa = questionsWithAnswers[i];
        const questionData: AirtableQuestion["fields"] = {
          text: qa.question,
          answer: qa.answer || "", // NEW: Include the answer
          generated_at: now,
          workflow: "transcription", // Questions generated from full transcript processing
          selected_final: true,
          card_tags: Array.isArray(studentCards) ? studentCards.join(", ") : "", // Convert to comma-separated string
          judge_rationale: rationales[i] || "", // Add rationale if available
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
      questionIds: questionResults.map(r => r.id),
      recordingFiles,
    });
  } catch (error: any) {
    console.error("Error saving to Airtable:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save data" },
      { status: 500 }
    );
  }
}
