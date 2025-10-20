/**
 * Shared types for exam components
 */

export type Stage =
  | "prep-select"
  | "prep-countdown"
  | "recording-prompt"
  | "recording-name"
  | "presentation"
  | "question-mode"
  | "questions"
  | "review-save"
  | "complete";

export type QuestionMode = "human" | "bot" | null;

export type QuestionRecordingState = "not-started" | "recording" | "stopped";

export interface ExamState {
  stage: Stage;
  prepTime: number;
  prepTimeRemaining: number;
  presentationTime: number;
  questionMode: QuestionMode;
  currentQuestionIndex: number;
  questionTime: number;

  studentName: string;
  studentCards: string[];

  isRecording: boolean;
  transcript: string;

  finalQuestions: string[];
  questionsLoading: boolean;

  questionAnswers: string[];
  presentationRecordingFile: string | null;
  questionRecordingFiles: string[];
  questionRecordingStates: QuestionRecordingState[];

  nameCardsRecordingFile: string | null;
  sessionId: string | null;

  isSpeaking: boolean;
  isSaving: boolean;
}

export interface ExamActions {
  startPrepTime: (minutes: number) => void;
  skipPrepTime: () => void;
  startRecording: () => Promise<void>;
  startPresentationTimer: () => Promise<void>;
  stopPresentation: () => Promise<void>;
  selectQuestionMode: (mode: QuestionMode) => Promise<void>;
  startQuestionRecording: () => Promise<void>;
  stopQuestionRecording: () => Promise<void>;
  startQuestionTimer: () => void;
  nextQuestion: () => Promise<void>;
  repeatQuestion: () => void;
  saveToAirtable: () => Promise<void>;
  setStage: (stage: Stage) => void;
}
