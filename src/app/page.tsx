"use client";

import { useEffect, useRef, useState } from "react";
import { AudioRecorder, blobToFile } from "@/utils/audioRecorder";
import AdminView from "@/components/exam/AdminView";
import StudentView from "@/components/exam/StudentView";
import type { Stage, QuestionMode, QuestionRecordingState } from "@/components/exam/types";

export default function Home() {
  // Stage management
  const [stage, setStage] = useState<Stage>("prep-select");
  const [prepTime, setPrepTime] = useState<number>(0);
  const [prepTimeRemaining, setPrepTimeRemaining] = useState<number>(0);
  const [presentationTime, setPresentationTime] = useState<number>(0);
  const [questionMode, setQuestionMode] = useState<QuestionMode>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [questionTime, setQuestionTime] = useState<number>(0);

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
    "Question 3 will appear here",
  ]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  // Question answers (recorded during question phase)
  const [questionAnswers, setQuestionAnswers] = useState<string[]>(["", "", ""]);
  const [presentationRecordingFile, setPresentationRecordingFile] = useState<string | null>(null);
  const [questionRecordingFiles, setQuestionRecordingFiles] = useState<string[]>(["", "", ""]);
  const questionStartTimeRef = useRef<number>(0);
  const [questionRecordingStates, setQuestionRecordingStates] = useState<QuestionRecordingState[]>([
    "not-started",
    "not-started",
    "not-started",
  ]);

  // Name/cards recording (separate from presentation)
  const [nameCardsRecordingFile, setNameCardsRecordingFile] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Text-to-speech for bot mode
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Timers
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const presentationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const questionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

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
      setPrepTimeRemaining((prev) => {
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

  // ============ STAGE 3: Start Recording (Name & Cards) ============
  const startRecording = async () => {
    try {
      console.group("🔴 RECORDING START: Name & Cards");
      console.log("⏰ Time:", new Date().toISOString());
      console.log("📍 Stage:", "recording-name");

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setTranscript("");
      setQuestionAnswers(["", "", ""]);
      setPresentationRecordingFile(null);
      setQuestionRecordingFiles(["", "", ""]);
      setQuestionRecordingStates(["not-started", "not-started", "not-started"]);

      // Initialize recorder with stream
      audioRecorderRef.current = new AudioRecorder();
      await audioRecorderRef.current.initialize(stream);
      audioRecorderRef.current.start();
      setIsRecording(true);
      setStage("recording-name");

      console.log("✅ Recording ACTIVE - Capturing student name and cards");
      console.log("🎤 Microphone stream:", stream.active ? "ACTIVE" : "INACTIVE");
      console.groupEnd();
    } catch (error) {
      console.error("❌ Failed to start recording:", error);
      console.groupEnd();
      alert("Could not access microphone. Please grant permission and try again.");
    }
  };

  // ============ STAGE 4: Start Presentation Timer ============
  const startPresentationTimer = async () => {
    console.group("⏹️ RECORDING STOP: Name & Cards");
    console.log("⏰ Time:", new Date().toISOString());

    // Stop the name/cards recording and save it separately
    if (audioRecorderRef.current && isRecording) {
      try {
        const { blob, duration } = await audioRecorderRef.current.stop();
        console.log("📼 Name/cards recording stopped");
        console.log("⏱️ Duration:", Math.round(duration / 1000), "seconds");
        console.log("💾 Blob size:", Math.round(blob.size / 1024), "KB");

        // Get timestamp
        const timestamp = new Date().toISOString();
        const timestampStr = timestamp.replace(/[:.]/g, "-").replace("T", "_").substring(0, 19);

        // Persist and transcribe in a single call
        console.log("💾 Saving + transcribing name/cards recording...");
        const nameCardsResult = await persistRecording(
          blob,
          `name-cards-${timestampStr}`,
          { transcribe: true }
        );

        const nameCardsTranscript = nameCardsResult.transcript || "";
        console.log("📝 Transcript:", nameCardsTranscript.substring(0, 100) + "...");

        console.log("🤖 Extracting structured student info...");
        const studentInfo = await extractStudentInfoStructured(nameCardsTranscript);
        console.log("👤 Student:", studentInfo.studentName);
        console.log("🎴 Cards:", studentInfo.cards);

        // Create session ID: studentName_timestamp
        const cleanName = studentInfo.studentName.replace(/\s+/g, "");
        const sessionIdValue = `${cleanName}_${timestampStr}`;
        setSessionId(sessionIdValue);

        console.log("🆔 Session ID created:", sessionIdValue);

        if (nameCardsResult.path) {
          setNameCardsRecordingFile(nameCardsResult.path);
          console.log("✅ Saved:", nameCardsResult.path);
        }

        // Create exam record in Airtable
        console.log("📊 Creating Airtable exam record...");
        await createExamRecord(
          sessionIdValue,
          studentInfo.studentName,
          studentInfo.cards,
          timestamp,
          nameCardsResult.path
        );

        console.groupEnd();

        // Restart recording for presentation
        console.group("🔴 RECORDING START: Presentation");
        console.log("⏰ Time:", new Date().toISOString());
        console.log("📍 Stage:", "presentation");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioRecorderRef.current = new AudioRecorder();
        await audioRecorderRef.current.initialize(stream);
        audioRecorderRef.current.start();
        console.log("✅ Recording ACTIVE - Capturing main presentation (4-6 min)");
        console.log("🎤 Microphone stream:", stream.active ? "ACTIVE" : "INACTIVE");
        console.groupEnd();
      } catch (error) {
        console.error("❌ Error processing name/cards recording:", error);
        console.groupEnd();
      }
    }

    setStage("presentation");
    setPresentationTime(0);

    presentationTimerRef.current = setInterval(() => {
      setPresentationTime((prev) => {
        if (prev >= 370) {
          stopPresentation();
          return 370;
        }
        return prev + 1;
      });
    }, 1000);
  };

  // ============ STAGE 4: Stop Presentation & Generate Questions ============
  const stopPresentation = async () => {
    if (presentationTimerRef.current) clearInterval(presentationTimerRef.current);

    console.group("⏹️ RECORDING STOP: Presentation");
    console.log("⏰ Time:", new Date().toISOString());

    if (audioRecorderRef.current && isRecording) {
      try {
        const { blob, duration } = await audioRecorderRef.current.stop();
        setIsRecording(false);

        console.log("📼 Presentation recording stopped");
        console.log("⏱️ Duration:", Math.round(duration / 1000), "seconds");
        console.log("💾 Blob size:", Math.round(blob.size / 1024), "KB");
        console.log("🔇 Recording is now INACTIVE - Questions will use manual controls");

        setQuestionsLoading(true);
        setStage("question-mode");

        console.log("💾 Saving presentation recording...");
        const presentationResult = await persistRecording(
          blob,
          sessionId ? `${sessionId}_presentation` : "presentation",
          { transcribe: true }
        );
        if (presentationResult.path) {
          setPresentationRecordingFile(presentationResult.path);
          console.log("✅ Saved:", presentationResult.path);
        }

        const transcriptText = presentationResult.transcript || "";
        setTranscript(transcriptText);
        console.log("📝 Transcript length:", transcriptText.length, "characters");

        console.log("🤔 Generating questions...");
        await generateQuestions(transcriptText);
        console.log("✅ Questions generated");

        setQuestionsLoading(false);
        console.groupEnd();
      } catch (error) {
        console.error("❌ Error processing presentation:", error);
        console.groupEnd();
        setQuestionsLoading(false);
        setIsRecording(false);
      }
    } else {
      console.log("⚠️ No active recording to stop");
      console.groupEnd();
      setStage("question-mode");
    }
  };

  // Extract student name and cards using STRUCTURED OUTPUT
  async function extractStudentInfoStructured(transcript: string): Promise<{
    studentName: string;
    cards: string[];
  }> {
    try {
      const response = await fetch("/api/extract-student-structured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      if (response.ok) {
        const data = await response.json();
        const studentName = data.studentName || "Unknown Student";
        const cards = data.cards || [];

        setStudentName(studentName);
        setStudentCards(cards);

        console.log("Extracted student info (structured):", { studentName, cards });

        return { studentName, cards };
      } else {
        console.error("Failed to extract student info");
        setStudentName("Unknown Student");
        setStudentCards([]);
        return { studentName: "Unknown Student", cards: [] };
      }
    } catch (error) {
      console.error("Error extracting student info:", error);
      setStudentName("Unknown Student");
      setStudentCards([]);
      return { studentName: "Unknown Student", cards: [] };
    }
  }

  // Create exam record in Airtable
  async function createExamRecord(
    sessionIdValue: string,
    studentName: string,
    cards: string[],
    timestamp: string,
    nameCardsRecording: string | null
  ) {
    try {
      const response = await fetch("/api/airtable/create-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdValue,
          studentName: studentName,
          cards: cards,
          timestamp: timestamp,
          nameCardsRecording: nameCardsRecording,
        }),
      });

      if (response.ok) {
        console.log("Exam record created successfully");
      } else {
        console.error("Failed to create exam record");
      }
    } catch (error) {
      console.error("Error creating exam record:", error);
    }
  }

  type RecordingUploadResult = {
    path: string | null;
    transcript: string | null;
  };

  // Persist audio recording to server storage (optional transcription)
  async function persistRecording(
    audioBlob: Blob,
    context: string,
    options: { transcribe?: boolean } = {}
  ): Promise<RecordingUploadResult> {
    try {
      const formData = new FormData();
      formData.append("audio", blobToFile(audioBlob, `${context}.webm`));
      formData.append("context", context);
      if (options.transcribe) {
        formData.append("transcribe", "true");
      }

      const response = await fetch("/api/recordings", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Recording persistence failed:", response.status, errorText);
        return { path: null, transcript: null };
      }

      const data = await response.json();
      const pathReference = data.relativePath || data.fileName || null;
      if (pathReference) {
        console.log(`Recording stored as ${pathReference}`);
      }
      return {
        path: pathReference,
        transcript: typeof data.transcript === "string" ? data.transcript : null,
      };
    } catch (error) {
      console.error("Error persisting recording:", error);
      return { path: null, transcript: null };
    }
  }

  // Generate questions using the dual workflow
  async function generateQuestions(transcriptText: string) {
    if (!transcriptText || transcriptText.trim().length === 0) {
      console.warn("No transcript available, using fallback questions");
      setFinalQuestions([
        "Can you elaborate on the main concepts you presented?",
        "How do these ideas connect to the course material?",
        "What questions do you have about this topic?",
      ]);
      return;
    }

    try {
      let termDefinitions = {};
      if (studentCards.length > 0) {
        try {
          const termsResponse = await fetch(`/api/airtable/terms?terms=${studentCards.join(",")}`);
          if (termsResponse.ok) {
            const termsData = await termsResponse.json();
            termDefinitions = termsData.definitions || {};
            console.log("Fetched card definitions:", termDefinitions);
          }
        } catch (error) {
          console.error("Error fetching card definitions:", error);
        }
      }

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

        let questionArray: string[] = [];

        if (questions.includes("1)") || questions.includes("2)")) {
          questionArray = questions
            .split(/\d+\)\s*/)
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 0)
            .slice(0, 3);
        }

        if (questionArray.length === 0 && questions.toLowerCase().includes("question")) {
          questionArray = questions
            .split(/Question\s+\d+:?\s*/i)
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 0)
            .slice(0, 3);
        }

        if (questionArray.length === 0) {
          questionArray = questions
            .split(/\n+/)
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 20)
            .slice(0, 3);
        }

        console.log("Parsed questions:", questionArray);

        if (questionArray.length >= 3) {
          setFinalQuestions(questionArray);
        } else if (questionArray.length > 0) {
          while (questionArray.length < 3) {
            questionArray.push("Can you elaborate further on this topic?");
          }
          setFinalQuestions(questionArray);
        } else {
          console.warn("No questions generated, using fallback");
          setFinalQuestions([
            "Can you elaborate on the main concepts you presented?",
            "How do these ideas connect to the course material?",
            "What questions do you have about this topic?",
          ]);
        }
      } else {
        console.error("Question generation API failed, using fallback");
        setFinalQuestions([
          "Can you elaborate on the main concepts you presented?",
          "How do these ideas connect to the course material?",
          "What questions do you have about this topic?",
        ]);
      }
    } catch (error) {
      console.error("Question generation error:", error);
      setFinalQuestions([
        "Can you elaborate on the main concepts you presented?",
        "How do these ideas connect to the course material?",
        "What questions do you have about this topic?",
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
      alert("Text-to-speech is not available. Please read the question manually.");
    }
  }

  function repeatQuestion() {
    if (questionMode === "bot" && finalQuestions[currentQuestionIndex]) {
      speakQuestion(finalQuestions[currentQuestionIndex]);
    }
  }

  // ============ SAVE TO AIRTABLE ============
  async function saveToAirtable() {
    if (isSaving) {
      console.log("⚠️ Already saving, skipping duplicate call");
      return;
    }

    setIsSaving(true);

    console.group("💾 SAVING TO AIRTABLE");
    console.log("⏰ Time:", new Date().toISOString());
    console.log("🆔 Session ID:", sessionId);
    console.log("👤 Student:", studentName);
    console.log("🎴 Cards:", studentCards);

    try {
      const questionsWithAnswers = finalQuestions.map((question, index) => ({
        question,
        answer: questionAnswers[index] || "",
        recordingFile: questionRecordingFiles[index] || "",
      }));

      console.log("📊 Recording Summary:");
      console.log("  - Name/Cards:", nameCardsRecordingFile || "MISSING");
      console.log("  - Presentation:", presentationRecordingFile || "MISSING");
      console.log("  - Question 1:", questionRecordingFiles[0] || "MISSING");
      console.log("  - Question 2:", questionRecordingFiles[1] || "MISSING");
      console.log("  - Question 3:", questionRecordingFiles[2] || "MISSING");

      console.log("📝 Answer Summary:");
      console.log(
        "  - Question 1:",
        questionAnswers[0] ? `${questionAnswers[0].substring(0, 50)}...` : "EMPTY"
      );
      console.log(
        "  - Question 2:",
        questionAnswers[1] ? `${questionAnswers[1].substring(0, 50)}...` : "EMPTY"
      );
      console.log(
        "  - Question 3:",
        questionAnswers[2] ? `${questionAnswers[2].substring(0, 50)}...` : "EMPTY"
      );

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
        const data = await response.json();
        console.log("✅ Successfully saved to Airtable");
        console.log("  - Transcript ID:", data.transcriptId);
        console.log("  - Question IDs:", data.questionIds);
      } else {
        const errorText = await response.text();
        console.error("❌ Failed to save to Airtable:", errorText);
      }
    } catch (error) {
      console.error("❌ Error saving to Airtable:", error);
    } finally {
      setIsSaving(false);
      console.groupEnd();
    }
  }

  // ============ STAGE 5: Select Question Mode ============
  const selectQuestionMode = async (mode: QuestionMode) => {
    setQuestionMode(mode);
    setCurrentQuestionIndex(0);
    setStage("questions");

    if (mode === "bot" && finalQuestions[0]) {
      setTimeout(() => {
        speakQuestion(finalQuestions[0]);
      }, 500);
    }
  };

  // ============ STAGE 6: Question Recording Controls ============
  const startQuestionRecording = async () => {
    try {
      console.group(`🔴 RECORDING START: Question ${currentQuestionIndex + 1}`);
      console.log("⏰ Time:", new Date().toISOString());
      console.log("📍 Question:", finalQuestions[currentQuestionIndex]);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioRecorderRef.current = new AudioRecorder();
      await audioRecorderRef.current.initialize(stream);
      audioRecorderRef.current.start();
      setIsRecording(true);

      setQuestionRecordingStates((prev) => {
        const updated = [...prev];
        updated[currentQuestionIndex] = "recording";
        return updated;
      });

      console.log(`✅ Recording ACTIVE - Question ${currentQuestionIndex + 1} answer`);
      console.log("🎤 Microphone stream:", stream.active ? "ACTIVE" : "INACTIVE");
      console.groupEnd();
    } catch (error) {
      console.error("❌ Failed to start question recording:", error);
      console.groupEnd();
      alert("Could not access microphone. Please grant permission and try again.");
    }
  };

  const stopQuestionRecording = async () => {
    if (!audioRecorderRef.current || !isRecording) {
      console.warn("⚠️ No active recording to stop");
      return;
    }

    try {
      console.group(`⏹️ RECORDING STOP: Question ${currentQuestionIndex + 1}`);
      console.log("⏰ Time:", new Date().toISOString());

      const { blob, duration } = await audioRecorderRef.current.stop();
      setIsRecording(false);

      console.log(`📼 Question ${currentQuestionIndex + 1} recording stopped`);
      console.log("⏱️ Duration:", Math.round(duration / 1000), "seconds");
      console.log("💾 Blob size:", Math.round(blob.size / 1024), "KB");

      setQuestionRecordingStates((prev) => {
        const updated = [...prev];
        updated[currentQuestionIndex] = "stopped";
        return updated;
      });

      const filename = sessionId
        ? `${sessionId}_question-${currentQuestionIndex + 1}`
        : `question-${currentQuestionIndex + 1}`;
      console.log("💾 Saving question recording as:", filename);
      const questionResult = await persistRecording(blob, filename, {
        transcribe: true,
      });
      if (questionResult.path) {
        setQuestionRecordingFiles((prev) => {
          const updated = [...prev];
          updated[currentQuestionIndex] = questionResult.path;
          return updated;
        });
        console.log("✅ Saved:", questionResult.path);
      }
      console.log("🔄 Transcription received from persistence service");
      const answerText = questionResult.transcript || "";
      console.log(
        `📝 Answer ${currentQuestionIndex + 1}:`,
        answerText.substring(0, 100) + (answerText.length > 100 ? "..." : "")
      );

      setQuestionAnswers((prev) => {
        const newAnswers = [...prev];
        newAnswers[currentQuestionIndex] = answerText;
        return newAnswers;
      });

      console.log(`✅ Question ${currentQuestionIndex + 1} complete`);
      console.groupEnd();
    } catch (error) {
      console.error(`❌ Error stopping question recording:`, error);
      console.groupEnd();
      setIsRecording(false);
    }
  };

  const startQuestionTimer = () => {
    setQuestionTime(60);

    questionTimerRef.current = setInterval(() => {
      setQuestionTime((prev) => {
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

    if (currentQuestionIndex < finalQuestions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      questionStartTimeRef.current = Date.now();

      if (questionMode === "bot" && finalQuestions[nextIndex]) {
        setTimeout(() => {
          speakQuestion(finalQuestions[nextIndex]);
        }, 500);
      }
    }
  };

  // ============ PRESENTATION TIMER COLOR ============
  const getPresentationTimerColor = () => {
    if (presentationTime < 240) return "#ef4444";
    if (presentationTime <= 360) return "#10b981";
    return "#ef4444";
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
        <AdminView
          state={{
            stage,
            prepTime,
            prepTimeRemaining,
            presentationTime,
            questionMode,
            currentQuestionIndex,
            questionTime,
            studentName,
            studentCards,
            isRecording,
            transcript,
            finalQuestions,
            questionsLoading,
            questionAnswers,
            presentationRecordingFile,
            questionRecordingFiles,
            questionRecordingStates,
            nameCardsRecordingFile,
            sessionId,
            isSpeaking,
            isSaving,
          }}
          actions={{
            startPrepTime,
            skipPrepTime,
            startRecording,
            startPresentationTimer,
            stopPresentation,
            selectQuestionMode,
            startQuestionRecording,
            stopQuestionRecording,
            startQuestionTimer,
            nextQuestion,
            repeatQuestion,
            saveToAirtable,
            setStage,
          }}
          getPresentationTimerColor={getPresentationTimerColor}
        />

        <StudentView
          state={{
            stage,
            prepTime,
            prepTimeRemaining,
            presentationTime,
            questionMode,
            currentQuestionIndex,
            questionTime,
            studentName,
            studentCards,
            isRecording,
            transcript,
            finalQuestions,
            questionsLoading,
            questionAnswers,
            presentationRecordingFile,
            questionRecordingFiles,
            questionRecordingStates,
            nameCardsRecordingFile,
            sessionId,
            isSpeaking,
            isSaving,
          }}
          getPresentationTimerColor={getPresentationTimerColor}
        />
      </div>
    </div>
  );
}
