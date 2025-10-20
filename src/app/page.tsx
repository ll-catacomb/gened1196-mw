"use client";

import { useEffect, useRef, useState } from "react";
import { AudioRecorder, blobToFile } from "@/utils/audioRecorder";
import { formatMMSS } from "@/utils/formatters";

type Stage = "prep-select" | "prep-countdown" | "recording-prompt" | "recording-name" | "presentation" | "question-mode" | "questions" | "complete";
type QuestionMode = "human" | "bot" | null;

export default function Home() {
  // Stage management
  const [stage, setStage] = useState<Stage>("prep-select");
  const [prepTime, setPrepTime] = useState<number>(0); // 300 or 450 seconds
  const [prepTimeRemaining, setPrepTimeRemaining] = useState<number>(0);
  const [presentationTime, setPresentationTime] = useState<number>(0); // Count up to 370s (6:10)
  const [questionMode, setQuestionMode] = useState<QuestionMode>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [questionTime, setQuestionTime] = useState<number>(0); // 60s per question
  
  // Student data
  const [studentName, setStudentName] = useState<string>("");
  const [studentCards, setStudentCards] = useState<string[]>([]);
  
  // Recording and transcription
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  
  // Generated questions
  const [finalQuestions, setFinalQuestions] = useState<string[]>([
    "Question 1 will appear here",
    "Question 2 will appear here", 
    "Question 3 will appear here"
  ]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  
  // Question answers (recorded during question phase)
  const [questionAnswers, setQuestionAnswers] = useState<string[]>(["", "", ""]);
  const [presentationRecordingFile, setPresentationRecordingFile] = useState<string | null>(null);
  const [questionRecordingFiles, setQuestionRecordingFiles] = useState<string[]>(["", "", ""]);
  const questionStartTimeRef = useRef<number>(0);
  
  // Text-to-speech for bot mode
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Timers
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const presentationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const questionTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
      if (presentationTimerRef.current) clearInterval(presentationTimerRef.current);
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, []);
  
  // ============ STAGE 1: Prep Time Selection ============
  const startPrepTime = (minutes: number) => {
    const seconds = minutes * 60;
    setPrepTime(seconds);
    setPrepTimeRemaining(seconds);
    setStage("prep-countdown");
    
    // Start countdown
    prepTimerRef.current = setInterval(() => {
      setPrepTimeRemaining(prev => {
        if (prev <= 1) {
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          setStage("recording-prompt");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  
  // Skip prep time if student is ready
  const skipPrepTime = () => {
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    setStage("recording-prompt");
  };
  
  // ============ STAGE 3: Start Recording ============
  const startRecording = async () => {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setTranscript("");
      setQuestionAnswers(["", "", ""]);
      setPresentationRecordingFile(null);
      setQuestionRecordingFiles(["", "", ""]);
      
      // Initialize recorder with stream
      audioRecorderRef.current = new AudioRecorder();
      await audioRecorderRef.current.initialize(stream);
      audioRecorderRef.current.start();
      setIsRecording(true);
      setStage("recording-name"); // Go to name recording stage, not presentation yet
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert("Could not access microphone. Please grant permission and try again.");
    }
  };
  
  // ============ STAGE 4: Start Presentation Timer ============
  const startPresentationTimer = () => {
    setStage("presentation");
    setPresentationTime(0);
    
    presentationTimerRef.current = setInterval(() => {
      setPresentationTime(prev => {
        if (prev >= 370) { // 6:10
          stopPresentation();
          return 370;
        }
        return prev + 1;
      });
    }, 1000);
  };
  
  // ============ STAGE 4: Stop Presentation & Generate Questions ============
  // Note: Recording continues for question answers
  const stopPresentation = async () => {
    if (presentationTimerRef.current) clearInterval(presentationTimerRef.current);
    
    if (audioRecorderRef.current && isRecording) {
      try {
        // Stop the current recording to get presentation transcript
        const { blob } = await audioRecorderRef.current.stop();
        
        // Change stage immediately and show loading spinner
        setQuestionsLoading(true);
        setStage("question-mode");
        
        // Persist presentation recording before transcription
        const presentationFile = await persistRecording(blob, "presentation");
        if (presentationFile) {
          setPresentationRecordingFile(presentationFile);
        }
        
        // Transcribe presentation audio
        const transcriptText = await transcribeAudio(blob);
        setTranscript(transcriptText);
        
        // Extract student name and cards from transcript using LLM
        await extractStudentInfo(transcriptText);
        
        // Generate questions
        await generateQuestions(transcriptText);
        
        // Questions are ready, stop loading
        setQuestionsLoading(false);
        
        // Restart recording for question answers
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioRecorderRef.current = new AudioRecorder();
        await audioRecorderRef.current.initialize(stream);
        audioRecorderRef.current.start();
        // isRecording stays true
      } catch (error) {
        console.error("Error processing presentation:", error);
        setQuestionsLoading(false);
        setIsRecording(false);
      }
    } else {
      setStage("question-mode");
    }
  };
  
  // Extract student name and cards using LLM
  async function extractStudentInfo(transcript: string) {
    try {
      const response = await fetch("/api/extract-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setStudentName(data.studentName || "Unknown Student");
        setStudentCards(data.cards || []);
        console.log("Extracted student info:", data);
      } else {
        console.error("Failed to extract student info");
        setStudentName("Unknown Student");
        setStudentCards([]);
      }
    } catch (error) {
      console.error("Error extracting student info:", error);
      setStudentName("Unknown Student");
      setStudentCards([]);
    }
  }
  
  // Persist audio recording to server storage
  async function persistRecording(audioBlob: Blob, context: string): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("audio", blobToFile(audioBlob, `${context}.webm`));
      formData.append("context", context);
      
      const response = await fetch("/api/recordings", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Recording persistence failed:", response.status, errorText);
        return null;
      }
      
      const data = await response.json();
      const pathReference = data.relativePath || data.fileName || null;
      if (pathReference) {
        console.log(`Recording stored as ${pathReference}`);
      }
      return pathReference;
    } catch (error) {
      console.error("Error persisting recording:", error);
      return null;
    }
  }
  
  // Transcribe audio using Whisper
  async function transcribeAudio(audioBlob: Blob): Promise<string> {
    try {
      const formData = new FormData();
      const audioFile = blobToFile(audioBlob, "recording.webm");
      formData.append("audio", audioFile);
      
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Transcription API error:", response.status, errorText);
        throw new Error(`Transcription failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data.text || "";
    } catch (error) {
      console.error("Transcription error:", error);
      // Return empty string to allow exam to continue
      return "";
    }
  }
  
  // Generate questions using the dual workflow
  async function generateQuestions(transcriptText: string) {
    // If no transcript, use fallback questions
    if (!transcriptText || transcriptText.trim().length === 0) {
      console.warn("No transcript available, using fallback questions");
      setFinalQuestions([
        "Can you elaborate on the main concepts you presented?",
        "How do these ideas connect to the course material?",
        "What questions do you have about this topic?"
      ]);
      return;
    }
    
    try {
      // Fetch card definitions from Airtable
      let termDefinitions = {};
      if (studentCards.length > 0) {
        try {
          const termsResponse = await fetch(`/api/airtable/terms?terms=${studentCards.join(',')}`);
          if (termsResponse.ok) {
            const termsData = await termsResponse.json();
            termDefinitions = termsData.definitions || {};
            console.log("Fetched card definitions:", termDefinitions);
          }
        } catch (error) {
          console.error("Error fetching card definitions:", error);
        }
      }
      
      // Generate questions with card context
      const response = await fetch("/api/q-thinking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptText,
          studentTerms: studentCards,
          termDefinitions: termDefinitions,
          scope: "full",
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const questions = data.questions || "";
        
        console.log("Raw questions from API:", questions);
        
        // Try multiple parsing strategies
        let questionArray: string[] = [];
        
        // Strategy 1: Split by "1)", "2)", "3)"
        if (questions.includes("1)") || questions.includes("2)")) {
          questionArray = questions
            .split(/\d+\)\s*/)
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 0)
            .slice(0, 3);
        }
        
        // Strategy 2: Split by "Question 1:", "Question 2:", etc.
        if (questionArray.length === 0 && questions.toLowerCase().includes("question")) {
          questionArray = questions
            .split(/Question\s+\d+:?\s*/i)
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 0)
            .slice(0, 3);
        }
        
        // Strategy 3: Split by newlines (if questions are on separate lines)
        if (questionArray.length === 0) {
          questionArray = questions
            .split(/\n+/)
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 20) // Filter out short lines
            .slice(0, 3);
        }
        
        console.log("Parsed questions:", questionArray);
        
        if (questionArray.length >= 3) {
          setFinalQuestions(questionArray);
        } else if (questionArray.length > 0) {
          // Got some questions but not 3, pad with fallbacks
          while (questionArray.length < 3) {
            questionArray.push("Can you elaborate further on this topic?");
          }
          setFinalQuestions(questionArray);
        } else {
          // No questions parsed, use fallback
          console.warn("No questions generated, using fallback");
          setFinalQuestions([
            "Can you elaborate on the main concepts you presented?",
            "How do these ideas connect to the course material?",
            "What questions do you have about this topic?"
          ]);
        }
      } else {
        // API error, use fallback
        console.error("Question generation API failed, using fallback");
        setFinalQuestions([
          "Can you elaborate on the main concepts you presented?",
          "How do these ideas connect to the course material?",
          "What questions do you have about this topic?"
        ]);
      }
    } catch (error) {
      console.error("Question generation error:", error);
      // Use fallback questions on error
      setFinalQuestions([
        "Can you elaborate on the main concepts you presented?",
        "How do these ideas connect to the course material?",
        "What questions do you have about this topic?"
      ]);
    }
  }
  
  // ============ TEXT-TO-SPEECH (Bot Mode) ============
  async function speakQuestion(questionText: string) {
    try {
      setIsSpeaking(true);
      
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: questionText }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("TTS API error:", response.status, errorText);
        throw new Error(`TTS failed: ${response.status} - ${errorText}`);
      }
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Create or reuse audio player
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      
      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      await audioPlayerRef.current.play();
    } catch (error) {
      console.error("TTS error:", error);
      setIsSpeaking(false);
      // Show user-friendly message
      alert("Text-to-speech is not available. Please read the question manually.");
    }
  }
  
  function repeatQuestion() {
    if (questionMode === "bot" && finalQuestions[currentQuestionIndex]) {
      speakQuestion(finalQuestions[currentQuestionIndex]);
    }
  }
  
  // ============ SAVE TO AIRTABLE ============
  const [isSaving, setIsSaving] = useState(false);
  
  async function saveToAirtable() {
    // Prevent duplicate saves
    if (isSaving) {
      console.log("Already saving, skipping duplicate call");
      return;
    }
    
    setIsSaving(true);
    
    try {
      // Create array of question-answer pairs
      const questionsWithAnswers = finalQuestions.map((question, index) => ({
        question,
        answer: questionAnswers[index] || "",
        recordingFile: questionRecordingFiles[index] || ""
      }));
      
      console.log("Saving to Airtable:", {
        studentName,
        studentCards,
        questions: finalQuestions,
        answers: questionAnswers,
        presentationRecordingFile,
        questionRecordingFiles
      });
      
      const response = await fetch("/api/airtable/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: studentName || "Unknown Student",
          studentCards: studentCards,
          fullTranscript: transcript,
          questionsWithAnswers: questionsWithAnswers,
          recordingFiles: {
            presentation: presentationRecordingFile,
            questions: questionRecordingFiles,
          },
        }),
      });
      
      if (response.ok) {
        console.log("Successfully saved to Airtable");
      } else {
        console.error("Failed to save to Airtable:", await response.text());
      }
    } catch (error) {
      console.error("Error saving to Airtable:", error);
    } finally {
      setIsSaving(false);
    }
  }
  
  // ============ STAGE 5: Select Question Mode ============
  const selectQuestionMode = async (mode: QuestionMode) => {
    setQuestionMode(mode);
    setCurrentQuestionIndex(0);
    setStage("questions");
    
    // If bot mode, automatically speak the first question
    if (mode === "bot" && finalQuestions[0]) {
      // Small delay to let the UI update
      setTimeout(() => {
        speakQuestion(finalQuestions[0]);
      }, 500);
    }
  };
  
  // ============ STAGE 6: Question Timers ============
  const startQuestionTimer = () => {
    setQuestionTime(60);
    
    questionTimerRef.current = setInterval(() => {
      setQuestionTime(prev => {
        if (prev <= 1) {
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  
  const nextQuestion = async () => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    setQuestionTime(0);
    
    // Capture answer for current question before moving to next
    await captureQuestionAnswer(currentQuestionIndex);
    
    if (currentQuestionIndex < finalQuestions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      questionStartTimeRef.current = Date.now();
      
      // If bot mode, speak the next question
      if (questionMode === "bot" && finalQuestions[nextIndex]) {
        setTimeout(() => {
          speakQuestion(finalQuestions[nextIndex]);
        }, 500);
      }
    }
  };
  
  // Capture answer audio for a specific question
  const captureQuestionAnswer = async (questionIndex: number): Promise<string> => {
    if (!audioRecorderRef.current || !isRecording) return "";
    
    try {
      // Stop current recording to get the answer
      const { blob } = await audioRecorderRef.current.stop();
      const questionFile = await persistRecording(blob, `question-${questionIndex + 1}`);
      if (questionFile) {
        setQuestionRecordingFiles(prev => {
          const updated = [...prev];
          updated[questionIndex] = questionFile;
          return updated;
        });
      }
      
      // Transcribe the answer
      const answerText = await transcribeAudio(blob);
      console.log(`Answer ${questionIndex + 1}:`, answerText);
      
      // Store the answer
      setQuestionAnswers(prev => {
        const newAnswers = [...prev];
        newAnswers[questionIndex] = answerText;
        return newAnswers;
      });
      
      // Restart recording for next question (if not the last one)
      if (questionIndex < finalQuestions.length - 1) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioRecorderRef.current = new AudioRecorder();
        await audioRecorderRef.current.initialize(stream);
        audioRecorderRef.current.start();
      }
      
      return answerText;
    } catch (error) {
      console.error(`Error capturing answer ${questionIndex + 1}:`, error);
      return "";
    }
  };
  
  // ============ PRESENTATION TIMER COLOR ============
  const getPresentationTimerColor = () => {
    if (presentationTime < 240) return "#ef4444"; // Red < 4min
    if (presentationTime <= 360) return "#10b981"; // Green 4-6min
    return "#ef4444"; // Red > 6min
  };
  
  // ============ RENDER ============
  return (
    <div
      style={{
        height: "100vh",
        background: "#f9fafb",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "24px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          height: "100%",
          minHeight: 0,
        }}
      >
        {/* ADMIN CONTROLS */}
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
          <div style={{ 
            fontSize: 12, 
            fontWeight: 600, 
            color: "#6b7280", 
            marginBottom: 16,
            letterSpacing: "0.05em"
          }}>
            ADMIN CONTROLS
          </div>
          
          {/* STAGE 1: Prep Time Selection */}
          {stage === "prep-select" && (
            <div>
              <p style={{ marginBottom: 20, fontSize: 16, color: "#374151" }}>
                When student has drawn cards and is set, pick the time:
              </p>
              <div style={{ display: "flex", gap: 16 }}>
                <button
                  onClick={() => startPrepTime(5)}
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
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                  }}
                >
                  5 Minutes
                </button>
                <button
                  onClick={() => startPrepTime(7.5)}
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
                    opacity: 0.7
                  }}
                >
                  7.5 Minutes<br/>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>(accommodation)</span>
                </button>
              </div>
            </div>
          )}
          
          {/* STAGE 2: Prep Countdown (buttons grayed out) */}
          {stage === "prep-countdown" && (
            <div>
              <div style={{ display: "flex", gap: 16, opacity: 0.5, marginBottom: 16 }}>
                <button disabled style={{
                  flex: 2, padding: "20px 32px", background: "#d1d5db",
                  color: "#6b7280", border: "none", borderRadius: 8,
                  fontSize: 20, fontWeight: 600, cursor: "not-allowed"
                }}>
                  5 Minutes
                </button>
                <button disabled style={{
                  flex: 1, padding: "16px 24px", background: "#d1d5db",
                  color: "#6b7280", border: "none", borderRadius: 8,
                  fontSize: 14, fontWeight: 500, cursor: "not-allowed"
                }}>
                  7.5 Minutes
                </button>
              </div>
              <p style={{ marginBottom: 16, fontSize: 14, color: "#6b7280", textAlign: "center" }}>
                Prep time in progress...
              </p>
              <button
                onClick={skipPrepTime}
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
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                }}
              >
                ✓ Student Ready
              </button>
            </div>
          )}
          
          {/* STAGE 3: Start Recording */}
          {stage === "recording-prompt" && (
            <div>
              <button
                onClick={startRecording}
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
                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                }}
              >
                🔴 Start Recording
              </button>
            </div>
          )}
          
          {/* STAGE 4: Recording Name - Wait for student to state name */}
          {stage === "recording-name" && (
            <div>
              <div style={{ 
                textAlign: "center", 
                padding: 24,
                background: "#fef3c7",
                borderRadius: 8,
                marginBottom: 16,
                border: "2px solid #f59e0b"
              }}>
                <div style={{ fontSize: 16, color: "#92400e", marginBottom: 8, fontWeight: 600 }}>
                  🎤 Recording...
                </div>
                <div style={{ fontSize: 14, color: "#78350f" }}>
                  Student is stating their name and cards
                </div>
              </div>
              <button
                onClick={startPresentationTimer}
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
                  boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                }}
              >
                ▶️ Start Timer
              </button>
            </div>
          )}
          
          {/* STAGE 5: Presentation Timer */}
          {stage === "presentation" && (
            <div>
              <div style={{ 
                textAlign: "center", 
                padding: 24,
                background: "#f9fafb",
                borderRadius: 8,
                marginBottom: 16
              }}>
                <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
                  Recording in progress...
                </div>
                <div style={{ 
                  fontSize: 48, 
                  fontWeight: 700,
                  color: getPresentationTimerColor(),
                  fontFamily: "monospace"
                }}>
                  {formatMMSS(presentationTime * 1000)}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                  {presentationTime < 240 && "⚠️ Under 4 minutes"}
                  {presentationTime >= 240 && presentationTime <= 360 && "✓ Good range (4-6 min)"}
                  {presentationTime > 360 && "⚠️ Over 6 minutes"}
                </div>
              </div>
              <button
                onClick={stopPresentation}
                style={{
                  width: "100%",
                  padding: "16px 32px",
                  background: "#1f2937",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Stop Recording & Generate Questions
              </button>
            </div>
          )}
          
          {/* STAGE 5: Question Mode Selection */}
          {stage === "question-mode" && (
            <div>
              {questionsLoading ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{
                    width: 60,
                    height: 60,
                    border: "6px solid #e5e7eb",
                    borderTop: "6px solid #3b82f6",
                    borderRadius: "50%",
                    margin: "0 auto 20px",
                    animation: "spin 1s linear infinite"
                  }} />
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
                      onClick={() => selectQuestionMode("human")}
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
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    >
                      👤 Human
                    </button>
                    <button
                      onClick={() => selectQuestionMode("bot")}
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
                        boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                      }}
                    >
                      🤖 Bot
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* STAGE 6: Question Display & Timer */}
          {stage === "questions" && (
            <div>
              {/* Recording indicator */}
              {isRecording && (
                <div style={{
                  background: "#fef2f2",
                  border: "2px solid #ef4444",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}>
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: "#ef4444",
                    animation: "pulse 2s infinite"
                  }} />
                  <div style={{ fontSize: 14, color: "#991b1b", fontWeight: 600 }}>
                    🎤 Recording student answer...
                  </div>
                </div>
              )}
              
              <div style={{ 
                background: "#f0fdf4",
                border: "2px solid #10b981",
                borderRadius: 8,
                padding: 24,
                marginBottom: 16
              }}>
                <div style={{ fontSize: 14, color: "#059669", marginBottom: 12, fontWeight: 600 }}>
                  Question {currentQuestionIndex + 1} of {finalQuestions.length}
                </div>
                <div style={{ fontSize: 18, color: "#064e3b", lineHeight: 1.6 }}>
                  {finalQuestions[currentQuestionIndex]}
                </div>
              </div>
              
              {/* Timer display */}
              {questionTime > 0 && (
                <div style={{ 
                  textAlign: "center",
                  fontSize: 64,
                  fontWeight: 700,
                  color: questionTime <= 10 ? "#ef4444" : "#10b981",
                  fontFamily: "monospace",
                  marginBottom: 16
                }}>
                  {questionTime}s
                </div>
              )}
              
              {/* Control buttons */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {questionTime === 0 && (
                  <button
                    onClick={startQuestionTimer}
                    style={{
                      flex: 1,
                      padding: "16px 32px",
                      background: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 18,
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    ⏱️ Start Timer
                  </button>
                )}
                
                {currentQuestionIndex < finalQuestions.length - 1 ? (
                  <button
                    onClick={nextQuestion}
                    style={{
                      flex: 1,
                      padding: "16px 32px",
                      background: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Next Question →
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      // Capture final answer before ending
                      const finalAnswer = await captureQuestionAnswer(currentQuestionIndex);
                      
                      // Update the answers array with the final answer
                      const updatedAnswers = [...questionAnswers];
                      updatedAnswers[currentQuestionIndex] = finalAnswer;
                      setQuestionAnswers(updatedAnswers);
                      
                      // Stop recording completely (already stopped in captureQuestionAnswer)
                      setIsRecording(false);
                      
                      // Small delay to ensure state updates
                      await new Promise(resolve => setTimeout(resolve, 100));
                      
                      // Save everything to Airtable with updated answers
                      await saveToAirtable();
                      setStage("complete");
                    }}
                    style={{
                      flex: 1,
                      padding: "16px 32px",
                      background: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    ✓ End Exam
                  </button>
                )}
                
                {/* Repeat Question button (only in bot mode) */}
                {questionMode === "bot" && (
                  <button
                    onClick={repeatQuestion}
                    disabled={isSpeaking}
                    style={{
                      padding: "16px 24px",
                      background: isSpeaking ? "#d1d5db" : "#8b5cf6",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: isSpeaking ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      opacity: isSpeaking ? 0.6 : 1
                    }}
                  >
                    {isSpeaking ? "🔊 Speaking..." : "🔁 Repeat Question"}
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* STAGE 7: Complete */}
          {stage === "complete" && (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <div style={{ 
                fontSize: 24, 
                color: "#10b981", 
                fontWeight: 600,
                marginBottom: 20
              }}>
                ✅ Exam Complete!
              </div>
              <div style={{ fontSize: 16, color: "#6b7280", marginBottom: 24 }}>
                The student has finished all questions.
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
                  cursor: "pointer"
                }}
              >
                Start New Exam
              </button>
            </div>
          )}
        </div>
        
        {/* STUDENT VIEW (What student sees) */}
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
          <div style={{ 
            fontSize: 12, 
            fontWeight: 600, 
            color: "#10b981", 
            marginBottom: 24,
            letterSpacing: "0.05em"
          }}>
            STUDENT VIEW
          </div>
          
          {/* STAGE 1: Draw Cards Instruction */}
          {stage === "prep-select" && (
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
          {stage === "prep-countdown" && (
            <div style={{ textAlign: "center", padding: "60px 40px" }}>
              <div style={{ fontSize: 18, color: "#6b7280", marginBottom: 20 }}>
                Preparation Time
              </div>
              <div style={{ 
                fontSize: 96, 
                fontWeight: 700,
                color: "#10b981",
                fontFamily: "monospace"
              }}>
                {formatMMSS(prepTimeRemaining * 1000)}
              </div>
            </div>
          )}
          
          {/* STAGE 3: Recording Prompt - Wait for admin to start */}
          {stage === "recording-prompt" && (
            <div style={{ textAlign: "center", padding: "60px 40px" }}>
              <div style={{ fontSize: 24, color: "#6b7280", fontStyle: "italic" }}>
                Waiting for proctor to start recording...
              </div>
            </div>
          )}
          
          {/* STAGE 4: Recording Name - State name and cards */}
          {stage === "recording-name" && (
            <div style={{ textAlign: "center", padding: "60px 40px" }}>
              <div style={{ 
                fontSize: 32, 
                color: "#1f2937", 
                fontWeight: 600, 
                marginBottom: 20 
              }}>
                State your name and your selected cards.
              </div>
              <div style={{ 
                fontSize: 18, 
                color: "#6b7280",
                marginTop: 24
              }}>
                🎤 Recording...
              </div>
            </div>
          )}
          
          {/* STAGE 5: Presentation Timer */}
          {stage === "presentation" && (
            <div style={{ textAlign: "center", padding: "60px 40px" }}>
              <div style={{ 
                fontSize: 120, 
                fontWeight: 700,
                color: getPresentationTimerColor(),
                fontFamily: "monospace"
              }}>
                {formatMMSS(presentationTime * 1000)}
              </div>
            </div>
          )}
          
          {/* STAGE 5: Follow-up Question Time */}
          {stage === "question-mode" && (
            <div style={{ textAlign: "center", padding: "60px 40px" }}>
              <div style={{ fontSize: 28, color: "#1f2937", fontWeight: 600, marginBottom: 16 }}>
                Follow-up Question Time!
              </div>
              <div style={{ fontSize: 20, color: "#6b7280", lineHeight: 1.6 }}>
                You'll have a minute for each question, but you can end anytime.
              </div>
            </div>
          )}
          
          {/* STAGE 6: Question Display */}
          {stage === "questions" && (
            <div style={{ textAlign: "center", padding: "80px 40px" }}>
              <div style={{ 
                fontSize: 48, 
                color: "#1f2937", 
                fontWeight: 600,
                marginBottom: 40
              }}>
                Question {currentQuestionIndex + 1}
              </div>
              
              {questionTime > 0 && (
                <div style={{ 
                  fontSize: 96,
                  fontWeight: 700,
                  color: questionTime <= 10 ? "#ef4444" : "#10b981",
                  fontFamily: "monospace"
                }}>
                  {questionTime}s
                </div>
              )}
            </div>
          )}
          
          {/* STAGE 7: Complete */}
          {stage === "complete" && (
            <div style={{ textAlign: "center", padding: "80px 40px" }}>
              <div style={{ 
                fontSize: 64, 
                marginBottom: 24
              }}>
                🎉
              </div>
              <div style={{ 
                fontSize: 48, 
                color: "#10b981", 
                fontWeight: 700,
                marginBottom: 20
              }}>
                Congratulations!
              </div>
              <div style={{ 
                fontSize: 28, 
                color: "#1f2937",
                lineHeight: 1.6
              }}>
                You're done!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
