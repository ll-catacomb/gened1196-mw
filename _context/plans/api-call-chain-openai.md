# API Call Chain (OpenAI-Orchestrated Flow)

This captures the request sequence once the proctor runs through a full oral-exam session in `src/app/page.tsx`.

## Stage 4: Wrap Presentation → Build Questions
1. `stopPresentation()` fires when the proctor ends the timed talk.
   - **`POST /api/recordings`**  
     - Uploads the presentation audio blob.  
     - `src/app/api/recordings/route.ts` writes the file into `/recordings/**/*` and returns the relative path.
   - **`POST /api/transcribe`**  
     - Sends the same blob to Whisper.  
     - `src/app/api/transcribe/route.ts` forwards to OpenAI’s `/v1/audio/transcriptions` and returns text.
   - **`POST /api/extract-cards`**  
     - Provides the transcript so GPT can pull the student name plus their cards.  
     - `src/app/api/extract-cards/route.ts` calls OpenAI chat completions (`gpt-4o-mini`) and returns `{ studentName, cards }`.
   - **`GET /api/airtable/terms?terms=…` (best-effort)**  
     - Attempts to fetch definitions for the stated cards.  
     - `src/app/api/airtable/terms/route.ts` currently ignores the query string, calls `fetchAllCards()`, and returns the entire card catalog (Airtable REST API).
   - **`POST /api/q-thinking`**  
     - Uses transcript + card context to craft the three follow-up questions.  
     - `src/app/api/q-thinking/route.ts` calls OpenAI chat (`MODELS.THINKING`) with embedded syllabus and grading rubric, then returns the raw question text; the client parses it into an array.

## Stage 6: For Each Question Response
Loop runs every time the examiner advances to the next question (including the last one before finishing):
1. `captureQuestionAnswer(questionIndex)` stops the active recorder.
   - **`POST /api/recordings`**  
     - Uploads that answer’s audio under the context `question-{n}`; server persists file alongside the presentation asset.
   - **`POST /api/transcribe`**  
     - Gets the answer transcript from Whisper so the UI can store text alongside the audio reference.
2. If another question remains, the client restarts local recording and waits for the next `captureQuestionAnswer`.

## Stage 6 (Bot Mode Optional): Speak Questions Aloud
- When the examiner picks “🤖 Bot,” `speakQuestion()` runs before each prompt (and for “Repeat Question”).
  - **`POST /api/tts`**  
    - Submits the question text.  
    - `src/app/api/tts/route.ts` invokes ElevenLabs (`/v1/text-to-speech/{voice}`) and streams the MP3 back to the browser.

## Stage 7: End Exam → Persist Everything
- Clicking “✓ End Exam” triggers `saveToAirtable()` after the final `captureQuestionAnswer`.
  1. **`POST /api/airtable/save`**  
     - Sends the student metadata, transcript, per-question transcripts, and recording filenames.
     - `src/app/api/airtable/save/route.ts` workflow:
       - Calls `saveTranscriptToAirtable()` → Airtable REST `Transcripts` table.
       - Requests rationales for each final question by `fetch`ing the same Next.js instance:
         - **`POST /api/question-rationale`**  
           - Backs onto OpenAI chat (`gpt-4o-mini`) to generate a 2‑3 sentence explanation per question.
       - Iterates through `questionsWithAnswers`, saving each via `saveQuestionToAirtable()` into the `Questions` table (Airtable REST).
     - Returns `{ success, transcriptId, questionIds, recordingFiles }` so the UI knows persistence succeeded.
- The UI then advances to the completion screen.

## Routes Not Hit in This Flow
- `/api/q-basic`, `/api/q-final`, `/api/q-judge`, `/api/q-final-judge`, `/api/realtime-session`: available in the repo but unused by the current landing page; legacy or experimental pipelines live there.
