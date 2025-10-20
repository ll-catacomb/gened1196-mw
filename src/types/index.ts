/**
 * Type definitions for the Real-Time Oral Exam Assistant
 */

/**
 * OpenAI Realtime API event structure
 */
export type OAIEvent = {
  type?: string;
  delta?: string;
  text?: { delta?: string };
} | any;

/**
 * Checkpoint question entry with timestamp
 */
export interface CheckpointQuestion {
  tSec: number;
  questions: string;
}

/**
 * Airtable types matching your actual table structure
 */

// Cards table
export interface AirtableCard {
  id: string;
  fields: {
    card: string;           // Primary field - card name
    description: string;    // Card description/definition
  };
}

// Exams table (NEW - stores metadata for each exam)
export interface AirtableExam {
  id?: string;
  fields: {
    session_id: string;      // PRIMARY: Unique session ID (studentName_timestamp)
    student_name: string;    // Student's name
    cards?: string;           // Comma-separated card names
    timestamp?: string;       // ISO datetime
    name_cards_recording?: string; // Path to name/cards recording file
    [key: string]: string | undefined;
  };
}

// Transcripts table
export interface AirtableTranscript {
  id?: string;
  fields: {
    transcript: string;      // Full transcript text
    student_name: string;    // Student's name
    cards?: string;          // Comma-separated card names (Long text field)
    timestamp: string;       // ISO datetime
    final_questions: string; // The final 3 questions
  };
}

// Questions table
export interface AirtableQuestion {
  id?: string;
  fields: {
    text: string;              // Question text
    answer?: string;           // Student's answer (transcribed)
    generated_at: string;      // ISO datetime
    workflow?: string;         // "realtime" | "recording" | "judge" - OPTIONAL
    judge_score?: number;      // Optional score
    judge_rationale?: string;  // Optional rationale
    selected_final?: boolean;  // Whether this was selected as final
    card_tags?: string;        // Related cards (comma-separated string)
  };
}

// Legacy type for backwards compatibility
export interface AirtableTerm {
  id: string;
  fields: {
    card: string;
    description: string;
  };
}

/**
 * Recording workflow types
 */
export interface RecordingChunk {
  timestamp: number; // when recording was captured
  audioBlob: Blob;
  duration: number; // duration in ms
}

export interface TranscriptionResult {
  text: string;
  duration: number;
}

/**
 * API request/response types
 */
export interface BasicQuestionRequest {
  text: string;
  tSec: number;
}

export interface BasicQuestionResponse {
  questions: string;
  error?: string;
}

export interface JudgeRequest {
  questions: string;
  transcript: string;
  scope: "first2_5" | "full";
}

export interface JudgeResponse {
  top: string;
  error?: string;
}

export interface FinalQuestionRequest {
  transcript: string;
  allQuestions: string;
  scope: "first2_5" | "full";
}

export interface FinalQuestionResponse {
  questions: string;
  error?: string;
}

export interface RealtimeSessionResponse {
  client_secret?: {
    value: string;
  };
  error?: string;
}

export interface WhisperTranscriptionRequest {
  audioFile: File | Blob;
}

export interface WhisperTranscriptionResponse {
  text: string;
  error?: string;
}

export interface ThinkingQuestionRequest {
  transcript: string;
  studentTerms: string[];
  termDefinitions: Record<string, string>;
  scope: "first2_5" | "full";
}

export interface ThinkingQuestionResponse {
  questions: string;
  error?: string;
}

export interface FinalJudgeRequest {
  realtimeQuestions: string;
  recordingQuestions: string;
  transcript: string;
  studentTerms: string[];
  termDefinitions: Record<string, string>;
}

export interface FinalJudgeResponse {
  finalQuestions: string;
  reasoning?: string;
  error?: string;
}
