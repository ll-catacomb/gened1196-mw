/**
 * Application-wide constants and configuration
 */

/**
 * Timing constants (in milliseconds)
 */
export const TIMING = {
  /** Interval for checkpoint question generation (30 seconds) */
  CHECKPOINT_MS: 30_000,
  
  /** Time window for first final questions (2.5 minutes) */
  FINAL_WINDOW_MS: 150_000,
  
  /** Idle flush interval for transcript consolidation */
  IDLE_FLUSH_MS: 5_000,
  
  /** Idle check interval */
  IDLE_CHECK_MS: 2_000,
  
  /** UI refresh interval for transcript display */
  UI_REFRESH_MS: 10_000,
  
  /** Clock update interval */
  CLOCK_UPDATE_MS: 250,
  
  /** Checkpoint ticker interval */
  CHECKPOINT_TICKER_MS: 1_000,
} as const;

/**
 * API timeout constants (in milliseconds)
 */
export const TIMEOUTS = {
  /** Timeout for checkpoint question generation */
  CHECKPOINT_QUESTIONS: 20_000,
  
  /** Timeout for judge filtering */
  JUDGE: 15_000,
  
  /** Timeout for final question generation */
  FINAL_QUESTIONS: 30_000,
  
  /** Timeout for realtime session creation */
  REALTIME_SESSION: 10_000,
} as const;

/**
 * OpenAI model configuration
 */
export const MODELS = {
  /** Realtime API model */
  REALTIME: "gpt-realtime",
  
  /** Transcription model (Whisper) */
  TRANSCRIBE: "gpt-4o-transcribe",
  
  /** Whisper model for audio transcription */
  WHISPER: "whisper-1",
  
  /** Chat completion model for question generation */
  CHAT: "o3-2025-04-16",
  
  /** Thinking model for deep analysis */
  THINKING: "o3-2025-04-16", // Can use o3 or o1 for reasoning
} as const;

/**
 * WebRTC configuration
 */
export const WEBRTC = {
  /** Data channel name for OpenAI events */
  DATA_CHANNEL: "oai-events",
  
  /** OpenAI Realtime API endpoint */
  REALTIME_ENDPOINT: "https://api.openai.com/v1/realtime?model=gpt-realtime",
} as const;

/**
 * VAD (Voice Activity Detection) configuration
 */
export const VAD_CONFIG = {
  type: "server_vad",
  threshold: 0.5,
  silence_duration_ms: 500,
  create_response: false,
} as const;
