# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An oral examination system for a folklore course (GenEd 1196) that conducts AI-powered oral exams with real-time transcription, dual-workflow question generation, text-to-speech, and Airtable integration. Students draw cards, present for 4-6 minutes, and answer 3 AI-generated follow-up questions.

## Development Commands

```bash
# Development server (with Turbopack)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

Access the app at http://localhost:3000

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `OPENAI_API_KEY` - Required for Whisper transcription and GPT-4 question generation
- `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` - Required for card definitions and data storage
- `AIRTABLE_CARDS_TABLE`, `AIRTABLE_TRANSCRIPTS_TABLE`, `AIRTABLE_QUESTIONS_TABLE` - Table names
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` - Optional, for bot mode TTS

## Architecture

### Stage-Based Workflow

The entire exam is controlled by a state machine in [src/app/page.tsx](src/app/page.tsx) with these stages:

1. **prep-select** - Admin selects 5 or 7.5 minute prep time
2. **prep-countdown** - Timer counts down while student prepares
3. **recording-prompt** - Admin starts recording
4. **recording-name** - Student states name and cards (recording active, no timer)
5. **presentation** - Timer counts up to 6:10, auto-stops, questions generate
6. **question-mode** - Admin selects human or bot mode
7. **questions** - 3 questions displayed with 60s timers
8. **complete** - Congratulations message

Stage transitions are managed by `setStage()`. Each stage has distinct UI for both admin controls and student view (designed for dual-screen projection).

### Dual-Workflow Question Generation

The system uses TWO parallel approaches to generate questions, then synthesizes the best results:

**Workflow 1: Real-time API** (during presentation)
- Uses OpenAI Realtime API with WebRTC ([src/app/api/realtime-session/route.ts](src/app/api/realtime-session/route.ts))
- Generates checkpoint questions every 30 seconds as student speaks
- Configured with `VAD_CONFIG` for voice activity detection
- Provides immediate, context-aware questions from live speech

**Workflow 2: Recording Analysis** (after presentation)
- Records full audio using `MediaRecorder` API ([src/utils/audioRecorder.ts](src/utils/audioRecorder.ts))
- Transcribes with Whisper ([src/app/api/transcribe/route.ts](src/app/api/transcribe/route.ts))
- Generates questions using o3/o1 reasoning model ([src/app/api/q-thinking/route.ts](src/app/api/q-thinking/route.ts))
- Deep analysis of complete presentation

**Final Judge** ([src/app/api/q-final-judge/route.ts](src/app/api/q-final-judge/route.ts))
- Receives questions from both workflows
- Synthesizes the top 3 questions using course syllabus, grading rubric, and student's selected cards
- Ensures pedagogical scaffolding: Q1-2 are scaffolding questions, Q3 is stretch goal

### Card Extraction

[src/app/api/extract-cards/route.ts](src/app/api/extract-cards/route.ts) uses GPT-4o-mini to extract student name and card names from the opening statement. It includes a hardcoded list of valid card names to fix transcription errors (e.g., "walking songs" → "Waulking Songs").

### Configuration Constants

[src/config/constants.ts](src/config/constants.ts) centralizes all timing, API timeouts, and model configuration:
- `TIMING` - Checkpoint intervals, flush times, UI refresh rates
- `TIMEOUTS` - API request timeouts
- `MODELS` - OpenAI model names (o3-2025-04-16 for reasoning, whisper-1, gpt-realtime)
- `VAD_CONFIG` - Voice activity detection settings

### Embedded Syllabus

The course syllabus and grading rubric are embedded directly in the question generation API routes (`q-thinking`, `q-final-judge`). This ensures questions are pedagogically aligned with course goals and grading standards.

### Presentation Timer Color Logic

Timer displays red/green based on thresholds ([src/app/page.tsx](src/app/page.tsx)):
- Red: < 4:00 (too short)
- Green: 4:00 - 6:00 (optimal)
- Red: > 6:00 (too long)
- Auto-stops at 6:10 (370 seconds)

### Airtable Schema

[src/lib/airtable.ts](src/lib/airtable.ts) and [src/types/index.ts](src/types/index.ts) define table structures:

**cards** table:
- `card` (text) - Card name
- `description` (long text) - Definition

**transcripts** table:
- `transcript` (long text) - Full presentation transcript
- `student_name` (text)
- `cards` (long text) - Comma-separated card names
- `timestamp` (date)
- `final_questions` (long text) - The 3 final questions

**questions** table:
- `text` (text) - Question text
- `answer` (long text) - Student's transcribed answer
- `generated_at` (date)
- `workflow` (text) - "realtime" | "recording" | "judge" (optional)
- `judge_score` (number) - Optional score
- `judge_rationale` (text) - Optional rationale
- `selected_final` (boolean) - Whether selected as final
- `card_tags` (text) - Related cards (comma-separated)

### Text-to-Speech (Bot Mode)

When admin selects bot mode, questions are read aloud using ElevenLabs ([src/app/api/tts/route.ts](src/app/api/tts/route.ts)). Audio is played via `HTMLAudioElement` with "Repeat Question" button.

## Key Files

- [src/app/page.tsx](src/app/page.tsx) - Main UI with stage machine, timers, dual-screen layout
- [src/config/constants.ts](src/config/constants.ts) - All configuration values
- [src/types/index.ts](src/types/index.ts) - TypeScript types
- [src/app/api/q-final-judge/route.ts](src/app/api/q-final-judge/route.ts) - Synthesizes best questions
- [src/app/api/realtime-session/route.ts](src/app/api/realtime-session/route.ts) - Creates OpenAI Realtime session
- [src/app/api/extract-cards/route.ts](src/app/api/extract-cards/route.ts) - Extracts student info from transcript
- [src/utils/audioRecorder.ts](src/utils/audioRecorder.ts) - Browser audio recording wrapper

## Modifying Timers

**Presentation time limit:**
```typescript
// In src/app/page.tsx
if (prev >= 370) { // Change 370 (6:10) to desired seconds
  stopRecording();
  return 370;
}
```

**Question timer duration:**
```typescript
// In src/app/page.tsx, in startQuestion()
setQuestionTime(60); // Change to desired seconds
```

**Prep time options:**
```typescript
// In src/app/page.tsx
<button onClick={() => startPrepTime(5)}>5 Minutes</button>
<button onClick={() => startPrepTime(7.5)}>7.5 Minutes</button>
```

## Styling

Uses inline styles only - no external CSS files or Tailwind configuration. All styling is in the JSX components.

## Common Issues

**Questions loading forever:** Check browser console for API errors. Ensure OpenAI API key has access to o3/o1 models. The dual workflow system requires both realtime and recording workflows to complete before the judge can synthesize.

**Student cards not extracted correctly:** Update the hardcoded list of valid card names in [src/app/api/extract-cards/route.ts](src/app/api/extract-cards/route.ts) to match your course cards.

**Recording fails to stop at 6:10:** The auto-stop logic is in the presentation timer interval. Check `setPresentationTime` callback in [src/app/page.tsx](src/app/page.tsx).

**Duplicate saves to Airtable:** The system prevents duplicate saves by checking if transcript/questions already exist before calling `/api/airtable/save`. If you see duplicates, check the save logic in the `stopRecording()` function.

## TypeScript

Path alias `@/*` maps to `./src/*` (configured in [tsconfig.json](tsconfig.json)). Always use `@/` imports for consistency.

## File Encoding

**IMPORTANT:** All files in this repository MUST use ASCII or UTF-8 encoding with standard characters only.

**Prohibited characters:**
- Unicode arrows (→, ⇒, ←, etc.) - Use `->`, `=>`, `<-` instead
- Box-drawing characters (│, ─, ┌, └, etc.) - Use `|`, `-`, `+` instead
- Special bullets (•, ◆, ▪, etc.) - Use `-`, `*` instead
- Fancy quotes ("", '', etc.) - Use `"` and `'` instead
- Em dashes (—) and en dashes (–) - Use `-` or `--` instead

**Why:** VSCode and other editors may have trouble opening files with non-ASCII Unicode characters, especially in markdown documentation.

**When creating documentation:**
- Use plain ASCII characters for diagrams and formatting
- Test that files can be opened in VSCode without errors
- If a file shows as "data" instead of "text" when running `file filename.md`, it likely has encoding issues
