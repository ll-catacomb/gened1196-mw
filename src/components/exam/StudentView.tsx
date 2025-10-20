/**
 * StudentView Component
 * Student-facing display for the oral exam (designed for projection)
 */

import { ExamState } from "./types";
import { formatMMSS } from "@/utils/formatters";

interface StudentViewProps {
  state: ExamState;
  getPresentationTimerColor: () => string;
}

export default function StudentView({ state, getPresentationTimerColor }: StudentViewProps) {
  return (
    <div
      style={{
        background: "white",
        border: "4px solid #10b981",
        borderRadius: 12,
        padding: 32,
        flex: 1,
        overflowY: "auto",
        minHeight: 0,
        scrollbarGutter: "stable",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#10b981",
          marginBottom: 24,
          letterSpacing: "0.05em",
        }}
      >
        STUDENT VIEW
      </div>

      {/* STAGE 1: Draw Cards Instruction */}
      {state.stage === "prep-select" && (
        <div style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ fontSize: 24, color: "#1f2937", lineHeight: 1.6 }}>
            Draw <strong>four (4) cards</strong> from each of the three stacks in front of you.
          </div>
          <div style={{ fontSize: 20, color: "#6b7280", marginTop: 20, lineHeight: 1.6 }}>
            You may use the paper and pencil for notes as you prepare for your oral presentation.
          </div>
        </div>
      )}

      {/* STAGE 2: Prep Countdown */}
      {state.stage === "prep-countdown" && (
        <div style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ fontSize: 18, color: "#6b7280", marginBottom: 20 }}>Preparation Time</div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              color: "#10b981",
              fontFamily: "monospace",
            }}
          >
            {formatMMSS(state.prepTimeRemaining * 1000)}
          </div>
        </div>
      )}

      {/* STAGE 3: Recording Prompt */}
      {state.stage === "recording-prompt" && (
        <div style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ fontSize: 24, color: "#6b7280", fontStyle: "italic" }}>
            Waiting for proctor to start recording...
          </div>
        </div>
      )}

      {/* STAGE 4: Recording Name */}
      {state.stage === "recording-name" && (
        <div style={{ textAlign: "center", padding: "60px 40px" }}>
          <div
            style={{
              fontSize: 32,
              color: "#1f2937",
              fontWeight: 600,
              marginBottom: 20,
            }}
          >
            State your name and your selected cards.
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#6b7280",
              marginTop: 24,
            }}
          >
            🎤 Recording...
          </div>
        </div>
      )}

      {/* STAGE 5: Presentation Timer */}
      {state.stage === "presentation" && (
        <div style={{ textAlign: "center", padding: "60px 40px" }}>
          <div
            style={{
              fontSize: 120,
              fontWeight: 700,
              color: getPresentationTimerColor(),
              fontFamily: "monospace",
            }}
          >
            {formatMMSS(state.presentationTime * 1000)}
          </div>
        </div>
      )}

      {/* STAGE 6: Follow-up Question Time */}
      {state.stage === "question-mode" && (
        <div style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ fontSize: 28, color: "#1f2937", fontWeight: 600, marginBottom: 16 }}>
            Follow-up Question Time!
          </div>
          <div style={{ fontSize: 20, color: "#6b7280", lineHeight: 1.6 }}>
            You'll have a minute for each question, but you can end anytime.
          </div>
        </div>
      )}

      {/* STAGE 7: Question Display */}
      {state.stage === "questions" && (
        <div style={{ textAlign: "center", padding: "80px 40px" }}>
          <div
            style={{
              fontSize: 48,
              color: "#1f2937",
              fontWeight: 600,
              marginBottom: 40,
            }}
          >
            Question {state.currentQuestionIndex + 1}
          </div>

          {state.questionTime > 0 && (
            <div
              style={{
                fontSize: 96,
                fontWeight: 700,
                color: state.questionTime <= 10 ? "#ef4444" : "#10b981",
                fontFamily: "monospace",
              }}
            >
              {state.questionTime}s
            </div>
          )}
        </div>
      )}

      {/* STAGE 8: Review & Save */}
      {state.stage === "review-save" && (
        <div style={{ textAlign: "center", padding: "60px 40px" }}>
          <div style={{ fontSize: 28, color: "#1f2937", fontWeight: 600, marginBottom: 16 }}>
            Great job!
          </div>
          <div style={{ fontSize: 20, color: "#6b7280", lineHeight: 1.6 }}>
            Your exam is being saved...
          </div>
        </div>
      )}

      {/* STAGE 9: Complete */}
      {state.stage === "complete" && (
        <div style={{ textAlign: "center", padding: "80px 40px" }}>
          <div
            style={{
              fontSize: 64,
              marginBottom: 24,
            }}
          >
            🎉
          </div>
          <div
            style={{
              fontSize: 48,
              color: "#10b981",
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            Congratulations!
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#1f2937",
              lineHeight: 1.6,
            }}
          >
            You're done!
          </div>
        </div>
      )}
    </div>
  );
}
