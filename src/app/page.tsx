"use client";

import { useEffect, useRef, useState } from "react";

type OAIEvent = { type?: string; delta?: string; text?: { delta?: string } } | any;

const CHECKPOINT_MS = 30_000;
const FINAL_WINDOW_MS = 150_000; // 2.5 min

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [err, setErr] = useState<string>("");

  // Elapsed clock
  const [elapsedMs, setElapsedMs] = useState(0);

  // Checkpoint questions list (each entry: { tSec, questions })
  const [checkpoints, setCheckpoints] = useState<{ tSec: number; questions: string }[]>([]);
  const [cpLoading, setCpLoading] = useState(false);

  // Final-2.5min and Final-Stop questions
  const [final2p5, setFinal2p5] = useState<string>("");
  const [final2p5Loading, setFinal2p5Loading] = useState(false);
  const [finalStop, setFinalStop] = useState<string>("");
  const [finalStopLoading, setFinalStopLoading] = useState(false);

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
  const checkpointsRef = useRef<{ tSec: number; questions: string }[]>([]);
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
    uiRefreshIntervalRef.current = window.setInterval(() => {
      setDisplayTranscript(snapshotTranscript());
    }, 10_000);
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
      if (now - lastDeltaTsRef.current > 5000) {
        const chunk = liveTextRef.current.trim();
        if (chunk) {
          setFinalText((prev) => (prev && !prev.endsWith("\n") ? prev + "\n" : prev) + chunk + "\n");
        }
        setLiveText("");
        liveTextRef.current = "";
      }
    }, 2000);
    return () => clearInterval(id);
  }, [connected]);

  // ---- Helpers: API calls ----
  async function askCheckpointQuestions(tSec: number, text: string) {
    try {
      setCpLoading(true);
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 20_000);
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
        setCheckpoints((prev) => [...prev, { tSec, questions }]);
      } finally {
        clearTimeout(to);
      }
    } catch (e: any) {
      setCheckpoints((prev) => [...prev, { tSec, questions: `(checkpoint error @ ${tSec}s) ${e?.message || e}` }]);
    } finally {
      setCpLoading(false);
    }
  }

  function gatherAllCheckpointQuestions(): string {
    return checkpointsRef.current.map((c) => c.questions).join("\n\n").trim();
  }

  // NEW: judge – pick top 3 from all checkpoint questions
  async function askJudge(allQs: string, transcript: string, scope: "first2_5" | "full") {
    if (!allQs.trim()) return "";
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 15_000);
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
      const to = setTimeout(() => ac.abort(), 30_000);
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

      // 3) WebRTC
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      for (const track of ms.getTracks()) pc.addTrack(track, ms);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          setErr(`Connection ${pc.iceConnectionState}. Try Stop → Start.`);
        }
      };

      dc.onmessage = (evt) => {
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
              const idx = Math.floor(elapsed / CHECKPOINT_MS);
              // Fire any missed checkpoints one by one
              while (lastCpIndexRef.current < idx) {
                lastCpIndexRef.current += 1;
                const tSec = Math.round((lastCpIndexRef.current * CHECKPOINT_MS) / 1000);
                const cumulative = snapshotTranscript();
                if (cumulative) askCheckpointQuestions(tSec, cumulative);
              }
            }, 1000);

            // schedule final @ 2.5 min
            final2p5TimerRef.current = window.setTimeout(() => {
              const snap = snapshotTranscript();
              const allQs = gatherAllCheckpointQuestions();
              if (snap) askFinal("first2_5", snap, allQs);
            }, FINAL_WINDOW_MS);

            // visible clock
            clockIntervalRef.current = window.setInterval(() => {
              if (firstDeltaAtRef.current) {
                setElapsedMs(Date.now() - firstDeltaAtRef.current);
              }
            }, 250);

            // 10s transcript UI refresh
            uiRefreshIntervalRef.current = window.setInterval(() => {
              setDisplayTranscript(snapshotTranscript());
            }, 10_000);
          }

          // Append live
          setLiveText((prev) => prev + t);
          liveTextRef.current += t;

          // If we get explicit completion, fold into finalized
          const isComplete = /complete|completed|final/.test(type) || type === "response.done";
          if (isComplete && liveTextRef.current) {
            const chunk = liveTextRef.current.trim();
            if (chunk) {
              setFinalText((prev) => (prev && !prev.endsWith("\n") ? prev + "\n" : prev) + chunk + "\n");
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
        "https://api.openai.com/v1/realtime?model=gpt-realtime",
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
            input_audio_transcription: { model: "gpt-4o-transcribe" },
            turn_detection: { type: "server_vad", threshold: 0.5, silence_duration_ms: 500, create_response: false },
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
    dcRef.current?.close(); pcRef.current?.close(); mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null; pcRef.current = null; mediaStreamRef.current = null;
  }

  async function stop() {
    // finalize any live text
    const remaining = (liveTextRef.current || "").trim();
    if (remaining) {
      setFinalText((prev) => (prev && !prev.endsWith("\n") ? prev + "\n" : prev) + remaining + "\n");
      setLiveText("");
      liveTextRef.current = "";
    }

    // Final on full session
    const allQs = gatherAllCheckpointQuestions();
    const full = snapshotTranscript();
    if (full) await askFinal("full", full, allQs);

    setConnected(false);
    cleanup();
    setElapsedMs(0);
    firstDeltaAtRef.current = null;
    lastCpIndexRef.current = 0;

    setDisplayTranscript(snapshotTranscript());
  }

  function formatMMSS(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

      {/* Checkpoint questions */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          Checkpoint questions (every 30s) {cpLoading ? <em style={{ marginLeft: 8 }}>(fetching…)</em> : null}
        </div>
        {checkpoints.length === 0 ? (
          <p style={{ margin: 0 }}>—</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {checkpoints.map((cp, i) => (
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

      {/* Final at 2.5 minutes */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Final questions (first 2.5 minutes)</div>
        {final2p5Loading ? (
          <em>Generating…</em>
        ) : (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{final2p5 || "—"}</pre>
        )}
      </section>

      {/* Final at Stop */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Final questions (full session on Stop)</div>
        {finalStopLoading ? (
          <em>Generating…</em>
        ) : (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "word-break" as any }}>{finalStop || "—"}</pre>
        )}
      </section>

      {/* Full transcript (auto-refreshed every 10s) */}
      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Full transcript</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{displayTranscript}</pre>
      </section>
    </main>
  );
}
