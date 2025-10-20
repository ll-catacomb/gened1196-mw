"use client";

import { useEffect, useRef, useState } from "react";
import { AudioRecorder, blobToFile } from "@/utils/audioRecorder";
import { formatMMSS } from "@/utils/formatters";

type Stage = "prep-select" | "prep-countdown" | "recording-prompt" | "recording-name" | "presentation" | "question-mode" | "questions" | "review-save" | "complete";
type QuestionMode = "human" | "bot" | null;
type QuestionRecordingState = "not-started" | "recording" | "stopped";

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
  const [questionRecordingStates, setQuestionRecordingStates] = useState<QuestionRecordingState[]>(["not-started", "not-started", "not-started"]);

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
      setStage("recording-name"); // Go to name recording stage, not presentation yet

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

        // Extract student name and cards from this recording using STRUCTURED OUTPUT
        console.log("🔄 Transcribing name/cards audio...");
        const nameCardsTranscript = await transcribeAudio(blob);
        console.log("📝 Transcript:", nameCardsTranscript.substring(0, 100) + "...");

        console.log("🤖 Extracting structured student info...");
        const studentInfo = await extractStudentInfoStructured(nameCardsTranscript);
        console.log("👤 Student:", studentInfo.studentName);
        console.log("🎴 Cards:", studentInfo.cards);

        // Create session ID: studentName_timestamp
        // Format: JohnDoe_2025-10-20_14-30-45
        const cleanName = studentInfo.studentName.replace(/\s+/g, "");
        const timestampStr = timestamp.replace(/[:.]/g, "-").replace("T", "_").substring(0, 19);
        const sessionIdValue = `${cleanName}_${timestampStr}`;
        setSessionId(sessionIdValue);

        console.log("🆔 Session ID created:", sessionIdValue);

        // Save name/cards recording with session ID
        console.log("💾 Saving name/cards recording...");
        const nameCardsFile = await persistRecording(blob, `${sessionIdValue}_name-cards`);
        if (nameCardsFile) {
          setNameCardsRecordingFile(nameCardsFile);
          console.log("✅ Saved:", nameCardsFile);
        }

        // Create exam record in Airtable
        console.log("📊 Creating Airtable exam record...");
        await createExamRecord(sessionIdValue, studentInfo.studentName, studentInfo.cards, timestamp, nameCardsFile);

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
        // isRecording stays true
      } catch (error) {
        console.error("❌ Error processing name/cards recording:", error);
        console.groupEnd();
      }
    }

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
  // Note: Recording STOPS here - questions will have manual recording controls
  const stopPresentation = async () => {
    if (presentationTimerRef.current) clearInterval(presentationTimerRef.current);

    console.group("⏹️ RECORDING STOP: Presentation");
    console.log("⏰ Time:", new Date().toISOString());

    if (audioRecorderRef.current && isRecording) {
      try {
        // Stop the current recording to get presentation transcript
        const { blob, duration } = await audioRecorderRef.current.stop();
        setIsRecording(false); // Stop recording after presentation

        console.log("📼 Presentation recording stopped");
        console.log("⏱️ Duration:", Math.round(duration / 1000), "seconds");
        console.log("💾 Blob size:", Math.round(blob.size / 1024), "KB");
        console.log("🔇 Recording is now INACTIVE - Questions will use manual controls");

        // Change stage immediately and show loading spinner
        setQuestionsLoading(true);
        setStage("question-mode");

        // Persist presentation recording with session ID
        console.log("💾 Saving presentation recording...");
        const presentationFile = await persistRecording(blob, sessionId ? `${sessionId}_presentation` : "presentation");
        if (presentationFile) {
          setPresentationRecordingFile(presentationFile);
          console.log("✅ Saved:", presentationFile);
        }

        // Transcribe presentation audio
        console.log("🔄 Transcribing presentation audio...");
        const transcriptText = await transcribeAudio(blob);
        setTranscript(transcriptText);
        console.log("📝 Transcript length:", transcriptText.length, "characters");

        // Generate questions
        console.log("🤔 Generating questions...");
        await generateQuestions(transcriptText);
        console.log("✅ Questions generated");

        // Questions are ready, stop loading
        setQuestionsLoading(false);

        console.groupEnd();

        // DO NOT restart recording - questions will have manual controls
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
  async function extractStudentInfoStructured(transcript: string): Promise<{ studentName: string; cards: string[] }> {
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

        // Update state
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
      // Create array of question-answer pairs
      const questionsWithAnswers = finalQuestions.map((question, index) => ({
        question,
        answer: questionAnswers[index] || "",
        recordingFile: questionRecordingFiles[index] || ""
      }));

      console.log("📊 Recording Summary:");
      console.log("  - Name/Cards:", nameCardsRecordingFile || "MISSING");
      console.log("  - Presentation:", presentationRecordingFile || "MISSING");
      console.log("  - Question 1:", questionRecordingFiles[0] || "MISSING");
      console.log("  - Question 2:", questionRecordingFiles[1] || "MISSING");
      console.log("  - Question 3:", questionRecordingFiles[2] || "MISSING");

      console.log("📝 Answer Summary:");
      console.log("  - Question 1:", questionAnswers[0] ? `${questionAnswers[0].substring(0, 50)}...` : "EMPTY");
      console.log("  - Question 2:", questionAnswers[1] ? `${questionAnswers[1].substring(0, 50)}...` : "EMPTY");
      console.log("  - Question 3:", questionAnswers[2] ? `${questionAnswers[2].substring(0, 50)}...` : "EMPTY");

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
    
    // If bot mode, automatically speak the first question
    if (mode === "bot" && finalQuestions[0]) {
      // Small delay to let the UI update
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

      // Update recording state for current question
      setQuestionRecordingStates(prev => {
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

      // Stop recording
      const { blob, duration } = await audioRecorderRef.current.stop();
      setIsRecording(false);

      console.log(`📼 Question ${currentQuestionIndex + 1} recording stopped`);
      console.log("⏱️ Duration:", Math.round(duration / 1000), "seconds");
      console.log("💾 Blob size:", Math.round(blob.size / 1024), "KB");

      // Update recording state
      setQuestionRecordingStates(prev => {
        const updated = [...prev];
        updated[currentQuestionIndex] = "stopped";
        return updated;
      });

      // Save recording with session ID
      const filename = sessionId ? `${sessionId}_question-${currentQuestionIndex + 1}` : `question-${currentQuestionIndex + 1}`;
      console.log("💾 Saving question recording as:", filename);
      const questionFile = await persistRecording(blob, filename);
      if (questionFile) {
        setQuestionRecordingFiles(prev => {
          const updated = [...prev];
          updated[currentQuestionIndex] = questionFile;
          return updated;
        });
        console.log("✅ Saved:", questionFile);
      }

      // Transcribe the answer
      console.log("🔄 Transcribing answer...");
      const answerText = await transcribeAudio(blob);
      console.log(`📝 Answer ${currentQuestionIndex + 1}:`, answerText.substring(0, 100) + (answerText.length > 100 ? "..." : ""));

      // Store the answer
      setQuestionAnswers(prev => {
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
              
              {/* Recording Controls */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {questionRecordingStates[currentQuestionIndex] === "not-started" && (
                  <button
                    onClick={startQuestionRecording}
                    style={{
                      flex: 1,
                      padding: "16px 32px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 18,
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    🔴 Start Recording Answer
                  </button>
                )}

                {questionRecordingStates[currentQuestionIndex] === "recording" && (
                  <button
                    onClick={stopQuestionRecording}
                    style={{
                      flex: 1,
                      padding: "16px 32px",
                      background: "#1f2937",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 18,
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    ⏹️ Stop Recording
                  </button>
                )}
              </div>

              {/* Timer Controls */}
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

                {/* Next Question / Review Before Save */}
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
                  questionRecordingStates[currentQuestionIndex] === "stopped" && (
                    <button
                      onClick={() => setStage("review-save")}
                      style={{
                        flex: 1,
                        padding: "16px 32px",
                        background: "#8b5cf6",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Review & Save →
                    </button>
                  )
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
          
          {/* STAGE 7: Review & Save */}
          {stage === "review-save" && (
            <div>
              <div style={{
                background: "#f0fdf4",
                border: "2px solid #10b981",
                borderRadius: 8,
                padding: 24,
                marginBottom: 16
              }}>
                <div style={{ fontSize: 18, color: "#064e3b", fontWeight: 600, marginBottom: 16 }}>
                  All recordings complete!
                </div>
                <div style={{ fontSize: 14, color: "#059669", lineHeight: 1.6 }}>
                  Student: {studentName || "Unknown"}<br/>
                  Cards: {studentCards.join(", ") || "None"}<br/>
                  Questions answered: {questionAnswers.filter(a => a).length} / 3
                </div>
              </div>

              <button
                onClick={async () => {
                  setIsSaving(true);
                  await saveToAirtable();
                  setStage("complete");
                }}
                disabled={isSaving}
                style={{
                  width: "100%",
                  padding: "20px 32px",
                  background: isSaving ? "#d1d5db" : "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 20,
                  fontWeight: 600,
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.6 : 1
                }}
              >
                {isSaving ? "Saving..." : "✓ Save to Airtable & Complete Exam"}
              </button>
            </div>
          )}

          {/* STAGE 8: Complete */}
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
          
          {/* STAGE 7: Review & Save */}
          {stage === "review-save" && (
            <div style={{ textAlign: "center", padding: "60px 40px" }}>
              <div style={{ fontSize: 28, color: "#1f2937", fontWeight: 600, marginBottom: 16 }}>
                Great job!
              </div>
              <div style={{ fontSize: 20, color: "#6b7280", lineHeight: 1.6 }}>
                Your exam is being saved...
              </div>
            </div>
          )}

          {/* STAGE 8: Complete */}
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
