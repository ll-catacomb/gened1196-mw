/**
 * AdminView Component
 * Admin-facing controls for managing the oral exam
 */

import { ExamState, ExamActions } from "./types";
import { formatMMSS } from "@/utils/formatters";

interface AdminViewProps {
  state: ExamState;
  actions: ExamActions;
  getPresentationTimerColor: () => string;
}

export default function AdminView({ state, actions, getPresentationTimerColor }: AdminViewProps) {
  return (
    <div
      style={{
        background: "white",
        border: "2px solid #e5e7eb",
        borderRadius: 12,
        padding: 24,
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
          color: "#6b7280",
          marginBottom: 16,
          letterSpacing: "0.05em",
        }}
      >
        ADMIN CONTROLS
      </div>

      {/* STAGE 1: Prep Time Selection */}
      {state.stage === "prep-select" && (
        <div>
          <p style={{ marginBottom: 20, fontSize: 16, color: "#374151" }}>
            When student has drawn cards and is set, pick the time:
          </p>
          <div style={{ display: "flex", gap: 16 }}>
            <button
              onClick={() => actions.startPrepTime(5)}
              style={{
                flex: 2,
                padding: "20px 32px",
                background: "#10b981",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 20,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              }}
            >
              5 Minutes
            </button>
            <button
              onClick={() => actions.startPrepTime(7.5)}
              style={{
                flex: 1,
                padding: "16px 24px",
                background: "#6b7280",
                color: "white",
                border: "2px dashed #9ca3af",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                opacity: 0.7,
              }}
            >
              7.5 Minutes
              <br />
              <span style={{ fontSize: 11, opacity: 0.8 }}>(accommodation)</span>
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2: Prep Countdown */}
      {state.stage === "prep-countdown" && (
        <div>
          <div style={{ display: "flex", gap: 16, opacity: 0.5, marginBottom: 16 }}>
            <button
              disabled
              style={{
                flex: 2,
                padding: "20px 32px",
                background: "#d1d5db",
                color: "#6b7280",
                border: "none",
                borderRadius: 8,
                fontSize: 20,
                fontWeight: 600,
                cursor: "not-allowed",
              }}
            >
              5 Minutes
            </button>
            <button
              disabled
              style={{
                flex: 1,
                padding: "16px 24px",
                background: "#d1d5db",
                color: "#6b7280",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: "not-allowed",
              }}
            >
              7.5 Minutes
            </button>
          </div>
          <p style={{ marginBottom: 16, fontSize: 14, color: "#6b7280", textAlign: "center" }}>
            Prep time in progress...
          </p>
          <button
            onClick={actions.skipPrepTime}
            style={{
              width: "100%",
              padding: "16px 32px",
              background: "#10b981",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            ✓ Student Ready
          </button>
        </div>
      )}

      {/* STAGE 3: Start Recording */}
      {state.stage === "recording-prompt" && (
        <div>
          <button
            onClick={actions.startRecording}
            style={{
              width: "100%",
              padding: "20px 32px",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 20,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
          >
            🔴 Start Recording
          </button>
        </div>
      )}

      {/* STAGE 4: Recording Name */}
      {state.stage === "recording-name" && (
        <div>
          <div
            style={{
              textAlign: "center",
              padding: 24,
              background: "#fef3c7",
              borderRadius: 8,
              marginBottom: 16,
              border: "2px solid #f59e0b",
            }}
          >
            <div style={{ fontSize: 16, color: "#92400e", marginBottom: 8, fontWeight: 600 }}>
              🎤 Recording...
            </div>
            <div style={{ fontSize: 14, color: "#78350f" }}>
              Student is stating their name and cards
            </div>
          </div>
          <button
            onClick={actions.startPresentationTimer}
            style={{
              width: "100%",
              padding: "20px 32px",
              background: "#10b981",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 20,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
          >
            ▶️ Start Timer
          </button>
        </div>
      )}

      {/* STAGE 5: Presentation Timer */}
      {state.stage === "presentation" && (
        <div>
          <div
            style={{
              textAlign: "center",
              padding: 24,
              background: "#f9fafb",
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
              Recording in progress...
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: getPresentationTimerColor(),
                fontFamily: "monospace",
              }}
            >
              {formatMMSS(state.presentationTime * 1000)}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
              {state.presentationTime < 240 && "⚠️ Under 4 minutes"}
              {state.presentationTime >= 240 && state.presentationTime <= 360 && "✓ Good range (4-6 min)"}
              {state.presentationTime > 360 && "⚠️ Over 6 minutes"}
            </div>
          </div>
          <button
            onClick={actions.stopPresentation}
            style={{
              width: "100%",
              padding: "16px 32px",
              background: "#1f2937",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Stop Recording & Generate Questions
          </button>
        </div>
      )}

      {/* STAGE 6: Question Mode Selection */}
      {state.stage === "question-mode" && (
        <div>
          {state.questionsLoading ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  border: "6px solid #e5e7eb",
                  borderTop: "6px solid #3b82f6",
                  borderRadius: "50%",
                  margin: "0 auto 20px",
                  animation: "spin 1s linear infinite",
                }}
              />
              <p style={{ fontSize: 18, color: "#374151", fontWeight: 600, marginBottom: 8 }}>
                Generating Questions...
              </p>
              <p style={{ fontSize: 14, color: "#6b7280" }}>
                Analyzing transcript and creating follow-up questions
              </p>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : (
            <>
              <p style={{ marginBottom: 20, fontSize: 16, color: "#374151", textAlign: "center" }}>
                Select question mode:
              </p>
              <div style={{ display: "flex", gap: 16 }}>
                <button
                  onClick={() => actions.selectQuestionMode("human")}
                  style={{
                    flex: 1,
                    padding: "20px 32px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 20,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                  }}
                >
                  👤 Human
                </button>
                <button
                  onClick={() => actions.selectQuestionMode("bot")}
                  style={{
                    flex: 1,
                    padding: "20px 32px",
                    background: "#8b5cf6",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 20,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                  }}
                >
                  🤖 Bot
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STAGE 7: Questions */}
      {state.stage === "questions" && (
        <div>
          {/* Recording indicator */}
          {state.isRecording && (
            <div
              style={{
                background: "#fef2f2",
                border: "2px solid #ef4444",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#ef4444",
                  animation: "pulse 2s infinite",
                }}
              />
              <div style={{ fontSize: 14, color: "#991b1b", fontWeight: 600 }}>
                🎤 Recording student answer...
              </div>
            </div>
          )}

          <div
            style={{
              background: "#f0fdf4",
              border: "2px solid #10b981",
              borderRadius: 8,
              padding: 24,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, color: "#059669", marginBottom: 12, fontWeight: 600 }}>
              Question {state.currentQuestionIndex + 1} of {state.finalQuestions.length}
            </div>
            <div style={{ fontSize: 18, color: "#064e3b", lineHeight: 1.6 }}>
              {state.finalQuestions[state.currentQuestionIndex]}
            </div>
          </div>

          {/* Timer display */}
          {state.questionTime > 0 && (
            <div
              style={{
                textAlign: "center",
                fontSize: 64,
                fontWeight: 700,
                color: state.questionTime <= 10 ? "#ef4444" : "#10b981",
                fontFamily: "monospace",
                marginBottom: 16,
              }}
            >
              {state.questionTime}s
            </div>
          )}

          {/* Recording Controls */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {state.questionRecordingStates[state.currentQuestionIndex] === "not-started" && (
              <button
                onClick={actions.startQuestionRecording}
                style={{
                  flex: 1,
                  padding: "16px 32px",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🔴 Start Recording Answer
              </button>
            )}

            {state.questionRecordingStates[state.currentQuestionIndex] === "recording" && (
              <button
                onClick={actions.stopQuestionRecording}
                style={{
                  flex: 1,
                  padding: "16px 32px",
                  background: "#1f2937",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⏹️ Stop Recording
              </button>
            )}
          </div>

          {/* Timer Controls */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {state.questionTime === 0 && (
              <button
                onClick={actions.startQuestionTimer}
                style={{
                  flex: 1,
                  padding: "16px 32px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⏱️ Start Timer
              </button>
            )}

            {/* Next Question / Review Before Save */}
            {state.currentQuestionIndex < state.finalQuestions.length - 1 ? (
              <button
                onClick={actions.nextQuestion}
                style={{
                  flex: 1,
                  padding: "16px 32px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Next Question →
              </button>
            ) : (
              state.questionRecordingStates[state.currentQuestionIndex] === "stopped" && (
                <button
                  onClick={() => actions.setStage("review-save")}
                  style={{
                    flex: 1,
                    padding: "16px 32px",
                    background: "#8b5cf6",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Review & Save →
                </button>
              )
            )}

            {/* Repeat Question button (only in bot mode) */}
            {state.questionMode === "bot" && (
              <button
                onClick={actions.repeatQuestion}
                disabled={state.isSpeaking}
                style={{
                  padding: "16px 24px",
                  background: state.isSpeaking ? "#d1d5db" : "#8b5cf6",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: state.isSpeaking ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  opacity: state.isSpeaking ? 0.6 : 1,
                }}
              >
                {state.isSpeaking ? "🔊 Speaking..." : "🔁 Repeat Question"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* STAGE 8: Review & Save */}
      {state.stage === "review-save" && (
        <div>
          <div
            style={{
              background: "#f0fdf4",
              border: "2px solid #10b981",
              borderRadius: 8,
              padding: 24,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 18, color: "#064e3b", fontWeight: 600, marginBottom: 16 }}>
              All recordings complete!
            </div>
            <div style={{ fontSize: 14, color: "#059669", lineHeight: 1.6 }}>
              Student: {state.studentName || "Unknown"}
              <br />
              Cards: {state.studentCards.join(", ") || "None"}
              <br />
              Questions answered: {state.questionAnswers.filter((a) => a).length} / 3
            </div>
          </div>

          <button
            onClick={async () => {
              await actions.saveToAirtable();
              actions.setStage("complete");
            }}
            disabled={state.isSaving}
            style={{
              width: "100%",
              padding: "20px 32px",
              background: state.isSaving ? "#d1d5db" : "#10b981",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 20,
              fontWeight: 600,
              cursor: state.isSaving ? "not-allowed" : "pointer",
              opacity: state.isSaving ? 0.6 : 1,
            }}
          >
            {state.isSaving ? "Saving..." : "✓ Save to Airtable & Complete Exam"}
          </button>
        </div>
      )}

      {/* STAGE 9: Complete */}
      {state.stage === "complete" && (
        <div style={{ textAlign: "center", padding: "40px" }}>
          <div
            style={{
              fontSize: 24,
              color: "#10b981",
              fontWeight: 600,
              marginBottom: 20,
            }}
          >
            ✅ Exam Complete!
          </div>
          <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 24 }}>
            The student has finished all questions. Data saved to Airtable.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "16px 32px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Start New Exam
          </button>
        </div>
      )}
    </div>
  );
}
