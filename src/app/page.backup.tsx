"use client";

import { useEffect, useRef, useState } from "react";
import { TIMING, TIMEOUTS, MODELS, WEBRTC, VAD_CONFIG } from "@/config/constants";
import { formatMMSS } from "@/utils/formatters";
import { AudioRecorder, blobToFile } from "@/utils/audioRecorder";
import type { OAIEvent, CheckpointQuestion } from "@/types";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [err, setErr] = useState<string>("");

  // Elapsed clock
  const [elapsedMs, setElapsedMs] = useState(0);

  // Checkpoint questions list
  const [checkpoints, setCheckpoints] = useState<CheckpointQuestion[]>([]);
  const [cpLoading, setCpLoading] = useState(false);

  // Final-2.5min and Final-Stop questions (REALTIME workflow)
  const [final2p5, setFinal2p5] = useState<string>("");
  const [final2p5Loading, setFinal2p5Loading] = useState(false);
  const [finalStop, setFinalStop] = useState<string>("");
  const [finalStopLoading, setFinalStopLoading] = useState(false);

  // RECORDING workflow questions
  const [recording2p5Questions, setRecording2p5Questions] = useState<string>("");
  const [recording2p5Loading, setRecording2p5Loading] = useState(false);
  const [recordingStopQuestions, setRecordingStopQuestions] = useState<string>("");
  const [recordingStopLoading, setRecordingStopLoading] = useState(false);

  // FINAL JUDGE questions (synthesis of both workflows)
  const [finalJudgeQuestions, setFinalJudgeQuestions] = useState<string>("");
  const [finalJudgeLoading, setFinalJudgeLoading] = useState(false);

  // Student info and cards
  const [studentName, setStudentName] = useState<string>("");
  const [studentCards, setStudentCards] = useState<string[]>([]);
  const [cardInput, setCardInput] = useState<string>("");
  const [cardDefinitions, setCardDefinitions] = useState<Record<string, string>>({});

  // Recording workflow state
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const [recording2p5Blob, setRecording2p5Blob] = useState<Blob | null>(null);
  const [recordingStopBlob, setRecordingStopBlob] = useState<Blob | null>(null);

  // Visible transcript (auto-refreshes every 10s)
  const [displayTranscript, setDisplayTranscript] = useState("");

  // WebRTC / timers
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Refs for live timing/state
  const firstDeltaAtRef = useRef<number | null>(null);
  const liveTextRef = useRef<string>("");
  const finalTextRef = useRef<string>("");
  const checkpointsRef = useRef<CheckpointQuestion[]>([]);
  const lastDeltaTsRef = useRef<number>(0);

  // Schedulers
  const cpTickerRef = useRef<number | null>(null);       // 1s ticker for checkpoints
  const lastCpIndexRef = useRef<number>(0);              // last checkpoint index fired
  const final2p5TimerRef = useRef<number | null>(null);  // 2.5 min timer
  const clockIntervalRef = useRef<number | null>(null);  // mm:ss clock
  const uiRefreshIntervalRef = useRef<number | null>(null); // transcript UI refresh (10s)

  // keep refs in sync
  useEffect(() => { liveTextRef.current = liveText; }, [liveText]);
  useEffect(() => { finalTextRef.current = finalText; }, [finalText]);
  useEffect(() => { checkpointsRef.current = checkpoints; }, [checkpoints]);

  // Build transcript string from refs
  function snapshotTranscript() {
    return (
      finalTextRef.current +
      (finalTextRef.current && liveTextRef.current ? "\n" : "") +
      liveTextRef.current
    ).trim();
  }

  // Immediately reflect any state change in the visible transcript
  useEffect(() => {
    setDisplayTranscript(snapshotTranscript());
  }, [finalText, liveText]);

  // 10s UI refresh to ensure on-screen transcript stays current
  useEffect(() => {
    if (!connected) {
      if (uiRefreshIntervalRef.current !== null) {
        clearInterval(uiRefreshIntervalRef.current);
        uiRefreshIntervalRef.current = null;
      }
      return;
    }
    uiRefreshIntervalRef.current = window.setInterval((): void => {
      setDisplayTranscript(snapshotTranscript());
    }, TIMING.UI_REFRESH_MS);
    return () => {
      if (uiRefreshIntervalRef.current !== null) {
        clearInterval(uiRefreshIntervalRef.current);
        uiRefreshIntervalRef.current = null;
      }
    };
  }, [connected]);

  // idle flush (defensive)
  useEffect(() => {
    const id = setInterval(() => {
      if (!connected) return;
      if (!liveTextRef.current) return;
      const now = Date.now();
      if (now - lastDeltaTsRef.current > TIMING.IDLE_FLUSH_MS) {
        const chunk = liveTextRef.current.trim();
        if (chunk) {
          setFinalText((prev: string) => (prev && !prev.endsWith("\n") ? prev + "\n" : prev) + chunk + "\n");
        }
        setLiveText("");
        liveTextRef.current = "";
      }
    }, TIMING.IDLE_CHECK_MS);
    return () => clearInterval(id);
  }, [connected]);

  // ---- Helpers: API calls ----
  async function askCheckpointQuestions(tSec: number, text: string) {
    try {
      setCpLoading(true);
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), TIMEOUTS.CHECKPOINT_QUESTIONS);
      try {
        const res = await fetch("/api/q-basic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, tSec }),
          signal: ac.signal,
        });
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const raw = await res.text();
          throw new Error(`Non-JSON (${res.status}): ${raw.slice(0, 200)}...`);
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        const questions = typeof json.questions === "string" ? json.questions : "";
        setCheckpoints((prev: CheckpointQuestion[]) => [...prev, { tSec, questions }]);
      } finally {
        clearTimeout(to);
      }
    } catch (e: unknown) {
      setCheckpoints((prev: CheckpointQuestion[]) => [...prev, { tSec, questions: `(checkpoint error @ ${tSec}s) ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setCpLoading(false);
    }
  }

  function gatherAllCheckpointQuestions(): string {
    return checkpointsRef.current.map((c: CheckpointQuestion) => c.questions).join("\n\n").trim();
  }

  // NEW: judge – pick top 3 from all checkpoint questions
  async function askJudge(allQs: string, transcript: string, scope: "first2_5" | "full") {
    if (!allQs.trim()) return "";
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), TIMEOUTS.JUDGE);
    try {
      const res = await fetch("/api/q-judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: allQs, transcript, scope }),
        signal: ac.signal,
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const raw = await res.text();
        throw new Error(`Non-JSON (${res.status}): ${raw.slice(0, 200)}...`);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      return typeof json.top === "string" ? json.top : "";
    } catch (e: any) {
      console.error("Judge error:", e?.message || e);
      return ""; // fall back to empty (we'll handle in askFinal)
    } finally {
      clearTimeout(to);
    }
  }

  // final: now calls judge first, then passes top-3 to q-final
  async function askFinal(scope: "first2_5" | "full", transcript: string, allQs: string) {
    const setLoading = scope === "first2_5" ? setFinal2p5Loading : setFinalStopLoading;
    const setText = scope === "first2_5" ? setFinal2p5 : setFinalStop;

    try {
      setLoading(true);
      // judge first
      const top3 = await askJudge(allQs, transcript, scope);
      const questionsForFinal = top3.trim() || allQs; // fallback to all if judge failed/empty

      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), TIMEOUTS.FINAL_QUESTIONS);
      try {
        const res = await fetch("/api/q-final", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, allQuestions: questionsForFinal, scope }),
          signal: ac.signal,
        });
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const raw = await res.text();
          throw new Error(`Non-JSON (${res.status}): ${raw.slice(0, 200)}...`);
        }
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        const questions = typeof json.questions === "string" ? json.questions : "";
        setText(questions);
      } finally {
        clearTimeout(to);
      }
    } catch (e: any) {
      setText(`(final ${scope} error) ${e?.name === "AbortError" ? "Request timed out" : e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  // ---- Recording Workflow Functions ----
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
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.text || "";
    } catch (error: any) {
      console.error("Transcription error:", error);
      return `(transcription error: ${error?.message || error})`;
    }
  }

  async function generateThinkingQuestions(
    transcript: string,
    scope: "first2_5" | "full",
    setQuestions: (q: string) => void,
    setLoading: (l: boolean) => void
  ) {
    try {
      setLoading(true);

      const response = await fetch("/api/q-thinking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          studentCards: studentCards,
          cardDefinitions: cardDefinitions,
          scope,
        }),
      });

      if (!response.ok) {
        throw new Error(`Question generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      setQuestions(data.questions || "");
    } catch (error: any) {
      console.error("Thinking questions error:", error);
      setQuestions(`(error: ${error?.message || error})`);
    } finally {
      setLoading(false);
    }
  }

  async function generateFinalJudgeQuestions() {
    try {
      setFinalJudgeLoading(true);

      const fullTranscript = snapshotTranscript();
      const realtimeQuestions = finalStop || final2p5;
      const recordingQuestions = recordingStopQuestions || recording2p5Questions;

      const response = await fetch("/api/q-final-judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realtimeQuestions,
          recordingQuestions,
          transcript: fullTranscript,
          studentCards,
          cardDefinitions,
        }),
      });

      if (!response.ok) {
        throw new Error(`Final judge failed: ${response.statusText}`);
      }

      const data = await response.json();
      setFinalJudgeQuestions(data.finalQuestions || "");
    } catch (error: any) {
      console.error("Final judge error:", error);
      setFinalJudgeQuestions(`(error: ${error?.message || error})`);
    } finally {
      setFinalJudgeLoading(false);
    }
  }

  async function saveToAirtable() {
    try {
      const fullTranscript = snapshotTranscript();

      await fetch("/api/airtable/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName,
          studentCards,
          fullTranscript,
          realtimeQuestions: finalStop,
          recordingQuestions: recordingStopQuestions,
          finalQuestions: finalJudgeQuestions,
        }),
      });
    } catch (error: any) {
      console.error("Save to Airtable error:", error);
    }
  }

  // ---- Term Management ----
  async function fetchTermDefinitionsFromAirtable() {
    if (studentCards.length === 0) return;

    try {
      const response = await fetch("/api/airtable/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNames: studentCards }),
      });

      if (response.ok) {
        const data = await response.json();
        setCardDefinitions(data.definitions || {});
      }
    } catch (error) {
      console.error("Error fetching term definitions:", error);
    }
  }

  function addTerm() {
    const term = cardInput.trim();
    if (term && !studentCards.includes(term)) {
      setStudentCards([...studentCards, term]);
      setCardInput("");
    }
  }

  function removeTerm(term: string) {
    setStudentCards(studentCards.filter((t) => t !== term));
  }

  // Fetch term definitions when student terms change
  useEffect(() => {
    fetchTermDefinitionsFromAirtable();
  }, [studentCards]);

  // ---- Start / Stop ----
  async function start() {
    if (connected) return;
    setErr("");

    // reset UI/state
    setLiveText(""); setFinalText("");
    setCheckpoints([]); setCpLoading(false);
    setFinal2p5(""); setFinal2p5Loading(false);
    setFinalStop(""); setFinalStopLoading(false);
    setElapsedMs(0);
    setDisplayTranscript("");

    firstDeltaAtRef.current = null;
    lastDeltaTsRef.current = 0;
    liveTextRef.current = ""; finalTextRef.current = "";
    checkpointsRef.current = []; lastCpIndexRef.current = 0;

    // clear timers
    if (cpTickerRef.current !== null) { clearInterval(cpTickerRef.current); cpTickerRef.current = null; }
    if (final2p5TimerRef.current !== null) { clearTimeout(final2p5TimerRef.current); final2p5TimerRef.current = null; }
    if (clockIntervalRef.current !== null) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; }
    if (uiRefreshIntervalRef.current !== null) { clearInterval(uiRefreshIntervalRef.current); uiRefreshIntervalRef.current = null; }

    try {
      // 1) ephemeral token
      const tokenRes = await fetch("/api/realtime-session");
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenJson?.error || "Failed to create session");
      const ephemeralKey = tokenJson.client_secret?.value as string;

      // 2) mic
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = ms;

      // 2b) Initialize audio recorder for recording workflow
      audioRecorderRef.current = new AudioRecorder();
      await audioRecorderRef.current.initialize(ms);
      audioRecorderRef.current.start();

      // 3) WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      for (const track of ms.getTracks()) pc.addTrack(track, ms);

      const dc = pc.createDataChannel(WEBRTC.DATA_CHANNEL);
      dcRef.current = dc;

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          setErr(`Connection ${pc.iceConnectionState}. Try Stop → Start.`);
        }
      };

      dc.onmessage = (evt: MessageEvent) => {
        try {
          const msg: OAIEvent = JSON.parse(evt.data);
          const type = String(msg?.type || "");
          const isTranscript = type.includes("transcript") || type.includes("input_audio_transcription");
          if (!isTranscript) {
            if (type.startsWith("response.")) {
              dc.send(JSON.stringify({ type: "response.cancel" }));
              dc.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
            }
            return;
          }

          const t = msg?.text?.delta ?? msg?.delta ?? "";
          if (!t) return;

          const now = Date.now();
          lastDeltaTsRef.current = now;

          // On very first delta, start timers/tickers
          if (firstDeltaAtRef.current === null) {
            firstDeltaAtRef.current = now;

            // 1s ticker for checkpoints + timer
            cpTickerRef.current = window.setInterval(() => {
              if (!firstDeltaAtRef.current) return;
              const elapsed = Date.now() - firstDeltaAtRef.current;
              setElapsedMs(elapsed); // update on-screen timer

              // Determine how many 30s boundaries we’ve crossed
              const idx = Math.floor(elapsed / TIMING.CHECKPOINT_MS);
              // Fire any missed checkpoints one by one
              while (lastCpIndexRef.current < idx) {
                lastCpIndexRef.current += 1;
                const tSec = Math.round((lastCpIndexRef.current * TIMING.CHECKPOINT_MS) / 1000);
                const cumulative = snapshotTranscript();
                if (cumulative) askCheckpointQuestions(tSec, cumulative);
              }
            }, TIMING.CHECKPOINT_TICKER_MS);

            // schedule final @ 2.5 min
            final2p5TimerRef.current = window.setTimeout(async () => {
              // REALTIME workflow
              const snap = snapshotTranscript();
              const allQs = gatherAllCheckpointQuestions();
              if (snap) askFinal("first2_5", snap, allQs);

              // RECORDING workflow - capture audio at 2.5 min
              if (audioRecorderRef.current) {
                try {
                  const { blob } = await audioRecorderRef.current.stop();
                  setRecording2p5Blob(blob);

                  // Transcribe and generate questions
                  const transcript = await transcribeAudio(blob);
                  if (transcript) {
                    await generateThinkingQuestions(
                      transcript,
                      "first2_5",
                      setRecording2p5Questions,
                      setRecording2p5Loading
                    );
                  }

                  // Restart recording for the rest of the session
                  audioRecorderRef.current.start();
                } catch (error) {
                  console.error("Error capturing 2.5min recording:", error);
                }
              }
            }, TIMING.FINAL_WINDOW_MS);

            // visible clock
            clockIntervalRef.current = window.setInterval(() => {
              if (firstDeltaAtRef.current) {
                setElapsedMs(Date.now() - firstDeltaAtRef.current);
              }
            }, TIMING.CLOCK_UPDATE_MS);

            // 10s transcript UI refresh
            uiRefreshIntervalRef.current = window.setInterval(() => {
              setDisplayTranscript(snapshotTranscript());
            }, TIMING.UI_REFRESH_MS);
          }

          // Append live
          setLiveText((prev: string) => prev + t);
          liveTextRef.current += t;

          // If we get explicit completion, fold into finalized
          const isComplete = /complete|completed|final/.test(type) || type === "response.done";
          if (isComplete && liveTextRef.current) {
            const chunk = liveTextRef.current.trim();
            if (chunk) {
              setFinalText((prev: string) => (prev && !prev.endsWith("\n") ? prev + "\n" : prev) + chunk + "\n");
            }
            setLiveText("");
            liveTextRef.current = "";
          }
        } catch {
          /* ignore keepalives */
        }
      };

      // 4) SDP
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResp = await fetch(
        WEBRTC.REALTIME_ENDPOINT,
        { method: "POST", headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" }, body: offer.sdp! }
      );
      if (!sdpResp.ok) throw new Error(`SDP exchange failed: ${await sdpResp.text()}`);
      const answer = { type: "answer", sdp: await sdpResp.text() } as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(answer);

      // 5) Session prefs: STT only
      dc.onopen = () => {
        setConnected(true);
        dc.send(JSON.stringify({
          type: "session.update",
          session: {
            input_audio_transcription: { model: MODELS.TRANSCRIBE },
            turn_detection: VAD_CONFIG,
            instructions: "Transcribe only. Do not generate replies or audio.",
          },
        }));
      };
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Unknown error starting mic/Realtime.");
      cleanup();
    }
  }

  function cleanup() {
    if (cpTickerRef.current !== null) { clearInterval(cpTickerRef.current); cpTickerRef.current = null; }
    if (final2p5TimerRef.current !== null) { clearTimeout(final2p5TimerRef.current); final2p5TimerRef.current = null; }
    if (clockIntervalRef.current !== null) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; }
    if (uiRefreshIntervalRef.current !== null) { clearInterval(uiRefreshIntervalRef.current); uiRefreshIntervalRef.current = null; }
    dcRef.current?.close(); pcRef.current?.close(); mediaStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    dcRef.current = null; pcRef.current = null; mediaStreamRef.current = null;
    
    // Cleanup audio recorder
    if (audioRecorderRef.current) {
      audioRecorderRef.current.cleanup();
      audioRecorderRef.current = null;
    }
  }

  async function stop() {
    // finalize any live text
    const remaining = (liveTextRef.current || "").trim();
    if (remaining) {
      setFinalText((prev: string) => (prev && !prev.endsWith("\n") ? prev + "\n" : prev) + remaining + "\n");
      setLiveText("");
      liveTextRef.current = "";
    }

    // REALTIME workflow - Final on full session
    const allQs = gatherAllCheckpointQuestions();
    const full = snapshotTranscript();
    if (full) await askFinal("full", full, allQs);

    // RECORDING workflow - capture final recording and process
    if (audioRecorderRef.current) {
      try {
        const { blob } = await audioRecorderRef.current.stop();
        setRecordingStopBlob(blob);

        // Transcribe and generate questions
        const transcript = await transcribeAudio(blob);
        if (transcript) {
          await generateThinkingQuestions(
            transcript,
            "full",
            setRecordingStopQuestions,
            setRecordingStopLoading
          );
        }

        // After both workflows complete, run final judge
        // Wait a moment for state to update
        setTimeout(async () => {
          await generateFinalJudgeQuestions();
          
          // Save to Airtable
          await saveToAirtable();
        }, 1000);
      } catch (error) {
        console.error("Error capturing final recording:", error);
      }
    }

    setConnected(false);
    cleanup();
    
    // Don't reset elapsed time immediately so we can see final duration
    firstDeltaAtRef.current = null;
    lastCpIndexRef.current = 0;

    setDisplayTranscript(snapshotTranscript());
  }

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>Transcript + Questions</h1>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={start} disabled={connected} style={{ padding: "8px 14px" }}>
          {connected ? "Connected" : "Start mic + transcript"}
        </button>
        <button onClick={stop} disabled={!connected} style={{ padding: "8px 14px" }}>
          Stop
        </button>
        <div style={{
          padding: "6px 10px",
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#f9fafb",
          fontVariantNumeric: "tabular-nums"
        }}>
          ⏱️ Elapsed: <strong>{formatMMSS(elapsedMs)}</strong>
        </div>
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: 12, border: "1px solid #f99", borderRadius: 8, background: "#fff5f5" }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      {/* Student Info & Cards Selection */}
      <section style={{ border: "2px solid #4f46e5", borderRadius: 8, padding: 16, marginBottom: 16, background: "#f5f3ff" }}>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 16 }}>📚 Student Information</div>
        
        {/* Student Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            Student Name:
          </label>
          <input
            type="text"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Enter student name..."
            style={{ 
              width: "100%", 
              padding: "8px 12px", 
              border: "1px solid #ddd", 
              borderRadius: 6,
              fontSize: 14
            }}
            disabled={connected}
          />
        </div>

        {/* Student Cards */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            Student Cards (3-5 required):
          </label>
          <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "#666" }}>
            Enter the 3-5 cards the student selected during prep time:
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={cardInput}
              onChange={(e) => setCardInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addTerm()}
              placeholder="Enter term name..."
              style={{ 
                flex: 1, 
                padding: "8px 12px", 
                border: "1px solid #ddd", 
                borderRadius: 6,
                fontSize: 14
              }}
              disabled={connected}
            />
            <button 
              onClick={addTerm} 
              disabled={!cardInput.trim() || connected}
              style={{ 
                padding: "8px 16px", 
                background: "#4f46e5", 
                color: "white", 
                border: "none", 
                borderRadius: 6,
                cursor: cardInput.trim() && !connected ? "pointer" : "not-allowed",
                opacity: cardInput.trim() && !connected ? 1 : 0.5
              }}
            >
              Add Term
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {studentCards.map((term) => (
              <div 
                key={term} 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 6, 
                  padding: "6px 12px", 
                  background: "white", 
                  border: "1px solid #4f46e5", 
                  borderRadius: 6,
                  fontSize: 14
                }}
              >
                <span>{term}</span>
                {!connected && (
                  <button 
                    onClick={() => removeTerm(term)}
                    style={{ 
                      background: "none", 
                      border: "none", 
                      color: "#ef4444", 
                      cursor: "pointer", 
                      padding: 0,
                      fontSize: 16,
                      lineHeight: 1
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {studentCards.length > 0 && studentCards.length < 3 && (
            <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#ef4444" }}>
              ⚠️ Please add at least 3 terms
            </p>
          )}
        </div>
      </section>

      {/* Checkpoint questions */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          Checkpoint questions (every 30s) {cpLoading ? <em style={{ marginLeft: 8 }}>(fetching…)</em> : null}
        </div>
        {checkpoints.length === 0 ? (
          <p style={{ margin: 0 }}>—</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {checkpoints.map((cp: CheckpointQuestion, i: number) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  T+{Math.round(cp.tSec / 30) * 30}s
                </div>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{cp.questions}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FINAL JUDGE QUESTIONS - Most Important */}
      <section style={{ border: "3px solid #10b981", borderRadius: 8, padding: 16, marginBottom: 16, background: "#ecfdf5" }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 18, color: "#047857" }}>
          🎯 FINAL THREE QUESTIONS (Judge Synthesis)
        </div>
        <p style={{ margin: "0 0 12px 0", fontSize: 14, color: "#666" }}>
          These are the final 3 questions synthesized from both workflows.
        </p>
        {finalJudgeLoading ? (
          <em>Generating final questions...</em>
        ) : finalJudgeQuestions ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 15, lineHeight: 1.6 }}>{finalJudgeQuestions}</pre>
        ) : (
          <p style={{ margin: 0, color: "#999" }}>Will appear after Stop is pressed</p>
        )}
      </section>

      {/* Workflow Comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* REALTIME Workflow */}
        <section style={{ border: "2px solid #3b82f6", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "#1e40af", fontSize: 16 }}>
            ⚡ Real-Time Workflow
          </div>
          
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>2.5 min questions:</div>
            {final2p5Loading ? (
              <em style={{ fontSize: 13 }}>Generating…</em>
            ) : (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13 }}>{final2p5 || "—"}</pre>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Full session questions:</div>
            {finalStopLoading ? (
              <em style={{ fontSize: 13 }}>Generating…</em>
            ) : (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13 }}>{finalStop || "—"}</pre>
            )}
          </div>
        </section>

        {/* RECORDING Workflow */}
        <section style={{ border: "2px solid #8b5cf6", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "#6d28d9", fontSize: 16 }}>
            🎙️ Recording Workflow (Thinking Model)
          </div>
          
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>2.5 min questions:</div>
            {recording2p5Loading ? (
              <em style={{ fontSize: 13 }}>Transcribing & generating…</em>
            ) : (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13 }}>{recording2p5Questions || "—"}</pre>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Full session questions:</div>
            {recordingStopLoading ? (
              <em style={{ fontSize: 13 }}>Transcribing & generating…</em>
            ) : (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13 }}>{recordingStopQuestions || "—"}</pre>
            )}
          </div>
        </section>
      </div>

      {/* Full transcript (auto-refreshed every 10s) */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Full transcript</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{displayTranscript}</pre>
      </section>
    </main>
  );
}
