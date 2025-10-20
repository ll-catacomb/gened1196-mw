# Complete API Call Chain - Oral Exam System

This document traces every API call made during a complete oral exam session, from start to finish.

---

## Timeline Overview

```
 Stage 1-2: Prep Time
   No API calls

 Stage 3: Recording Prompt
   No API calls (mic access via browser)

 Stage 4: Recording Name + Presentation
   No API calls (recording locally in browser)

 Stage 5: Stop Presentation
   =5 POST /api/recordings (presentation audio)
   =5 POST /api/transcribe (Whisper)
   =5 POST /api/extract-cards (GPT-4o-mini)
   =5 GET /api/airtable/terms (fetch card definitions)
   =5 POST /api/q-thinking (o3 reasoning)

 Stage 6: Question Mode Selection
   No API calls

 Stage 7: Questions (repeated for Q1, Q2, Q3)
   =5 POST /api/tts (optional, if bot mode)
   =5 POST /api/recordings (question answer audio)
   =5 POST /api/transcribe (Whisper)

 Stage 8: Complete
    =5 POST /api/question-rationale (GPT-4o-mini)
    =5 POST /api/airtable/save (transcripts table)
    =5 POST /api/airtable/save (questions table)
```

---

## Detailed API Call Breakdown

### **STAGE 5: Stop Presentation & Generate Questions**

This is the busiest stage with multiple sequential API calls.

---

#### = **Call #1: Save Presentation Recording**

**Endpoint:** `POST /api/recordings`
**Trigger:** `stopPresentation()`  `persistRecording(blob, "presentation")`
**Location:** [page.tsx:140](../src/app/page.tsx#L140)

**Request:**
```typescript
FormData {
  audio: File (audio/webm, ~6-10 minutes, presentation + name statement)
  context: "presentation"
}
```

**What it does:**
- Receives audio blob from client
- Converts to Node.js Buffer
- Detects file extension (webm, ogg, mp3, wav)
- Sanitizes context string
- Generates filename: `{timestamp}_{context}_{random4chars}.{ext}`
  - Example: `2025-10-20T12-34-56_presentation_a1b2c3d4.webm`
- Creates `recordings/` directory if needed
- Writes file to disk: `recordings/{filename}`

**Response:**
```json
{
  "success": true,
  "fileName": "2025-10-20T12-34-56_presentation_a1b2c3d4.webm",
  "relativePath": "recordings/2025-10-20T12-34-56_presentation_a1b2c3d4.webm"
}
```

**Implementation:** [src/app/api/recordings/route.ts](../src/app/api/recordings/route.ts)

---

#### = **Call #2: Transcribe Presentation**

**Endpoint:** `POST /api/transcribe`
**Trigger:** `stopPresentation()`  `transcribeAudio(blob)`
**Location:** [page.tsx:146](../src/app/page.tsx#L146)

**Request:**
```typescript
FormData {
  audio: File (audio/webm, same blob from recording)
}
```

**What it does:**
- Receives audio file
- Validates OpenAI API key
- Calls OpenAI Whisper API:
  ```typescript
  POST https://api.openai.com/v1/audio/transcriptions
  {
    model: "whisper-1",
    file: audioFile,
    language: "en" // optional
  }
  ```
- Returns transcribed text

**Response:**
```json
{
  "text": "My name is Sarah Johnson. My cards are Folklore, Ethnography, and Worldview. In this presentation I will discuss..."
}
```

**External API Called:** OpenAI Whisper API
**Cost:** ~$0.006 per minute of audio (~$0.03-0.06 for 6-minute presentation)
**Implementation:** [src/app/api/transcribe/route.ts](../src/app/api/transcribe/route.ts)

---

#### = **Call #3: Extract Student Name & Cards**

**Endpoint:** `POST /api/extract-cards`
**Trigger:** `stopPresentation()`  `extractStudentInfo(transcript)`
**Location:** [page.tsx:150](../src/app/page.tsx#L150)

**Request:**
```json
{
  "transcript": "My name is Sarah Johnson. My cards are Folklore, Ethnography, and Worldview..."
}
```

**What it does:**
- Uses GPT-4o-mini to parse transcript
- Extracts:
  - Student's full name
  - List of cards mentioned
- Includes hardcoded list of valid card names to fix transcription errors
  - Example: "walking songs"  "Waulking Songs"
- Returns structured JSON

**Response:**
```json
{
  "studentName": "Sarah Johnson",
  "cards": ["Folklore", "Ethnography", "Worldview"]
}
```

**External API Called:** OpenAI GPT-4o-mini
**Cost:** ~$0.001-0.002
**Implementation:** [src/app/api/extract-cards/route.ts](../src/app/api/extract-cards/route.ts)

**Valid Card Names List:**
```
Folklore, Triviality, Barrier, Domestic Crafts, Worldview, Identity Statement,
Honor Pledge, Murder Ballads, Harvard Lore, Waulking Songs, Child Ballads,
Taylor Swift, Structuralism, Transmission, Ethnopoetics, Twin Laws,
Esoteric-Exoteric Factor, Jokes, Cards, Ethnography, Shanty Talk, Folk Group,
Black Ash Basket Making, Digital Folklore, Authenticity, Genre,
Decorated Mortarboards, Meshworks
```

---

#### = **Call #4: Fetch Card Definitions from Airtable**

**Endpoint:** `GET /api/airtable/terms?terms={card1,card2,card3}`
**Trigger:** `generateQuestions()`  fetch card definitions
**Location:** [page.tsx:275](../src/app/page.tsx#L275)

**Request:**
```
GET /api/airtable/terms?terms=Folklore,Ethnography,Worldview
```

**What it does:**
- Queries Airtable "cards" table
- Fetches definitions for specified cards
- Uses Airtable API with filter formula:
  ```javascript
  OR(
    {card}='Folklore',
    {card}='Ethnography',
    {card}='Worldview'
  )
  ```

**Response:**
```json
{
  "definitions": {
    "Folklore": "Informal, traditional expressions of culture passed through communities...",
    "Ethnography": "A qualitative research method involving observation and documentation...",
    "Worldview": "The fundamental cognitive orientation of individuals or societies..."
  }
}
```

**External API Called:** Airtable REST API
**Cost:** Free tier allows 1,000 requests/month
**Implementation:** [src/app/api/airtable/terms/route.ts](../src/app/api/airtable/terms/route.ts)

---

#### = **Call #5: Generate Questions with Reasoning Model**

**Endpoint:** `POST /api/q-thinking`
**Trigger:** `generateQuestions()`  main question generation
**Location:** [page.tsx:287](../src/app/page.tsx#L287)

**Request:**
```json
{
  "transcript": "My name is Sarah Johnson. My cards are...",
  "studentTerms": ["Folklore", "Ethnography", "Worldview"],
  "termDefinitions": {
    "Folklore": "Informal, traditional expressions...",
    "Ethnography": "A qualitative research method...",
    "Worldview": "The fundamental cognitive orientation..."
  },
  "scope": "full"
}
```

**What it does:**
- Uses OpenAI o3 (or o1) reasoning model
- Analyzes full transcript with card definitions
- Applies embedded course syllabus and grading rubric
- Generates 3 pedagogically scaffolded questions:
  - **Q1-Q2:** Scaffolding questions (build on presentation)
  - **Q3:** Stretch goal (deeper synthesis)
- Returns questions as formatted text

**Prompt strategy:**
1. Provides course goals and grading rubric
2. Includes student's selected cards + definitions
3. Analyzes transcript for understanding level
4. Generates questions that:
   - Target gaps or opportunities for deeper thinking
   - Connect to course concepts
   - Scaffold from accessible to challenging

**Response:**
```json
{
  "questions": "1) You mentioned that folklore is 'passed down through generations.' Can you explain how this transmission process relates to the concept of Worldview that you discussed?\n\n2) In your presentation, you touched on Ethnography as a method. How might an ethnographer document the folklore practices you described?\n\n3) Drawing on all three cards, how do informal traditions both reflect and shape a community's sense of identity?"
}
```

**External API Called:** OpenAI o3/o1 API
**Cost:** ~$0.05-0.15 per request (reasoning models are expensive)
**Timeout:** 30 seconds
**Implementation:** [src/app/api/q-thinking/route.ts](../src/app/api/q-thinking/route.ts)

---

#### = **Question Parsing (Client-Side)**

After receiving questions, the client tries 3 parsing strategies:

**Strategy 1:** Split by `1)`, `2)`, `3)`
```javascript
questions.split(/\d+\)\s*/)
```

**Strategy 2:** Split by `Question 1:`, `Question 2:`, etc.
```javascript
questions.split(/Question\s+\d+:?\s*/i)
```

**Strategy 3:** Split by newlines (fallback)
```javascript
questions.split(/\n+/).filter(q => q.length > 20)
```

**Fallback questions:** If parsing fails:
```javascript
[
  "Can you elaborate on the main concepts you presented?",
  "How do these ideas connect to the course material?",
  "What questions do you have about this topic?"
]
```

**Location:** [page.tsx:308-352](../src/app/page.tsx#L308-L352)

---

### **STAGE 7: Questions (For Each Question)**

This stage loops 3 times (once per question). Each iteration includes:

---

#### = **Call #6a: Text-to-Speech (Bot Mode Only)**

**Endpoint:** `POST /api/tts`
**Trigger:** `selectQuestionMode("bot")`  `speakQuestion(questionText)`
**Location:** [page.tsx:378](../src/app/page.tsx#L378)

**When it runs:**
- Only if admin selects "Bot Mode"
- Automatically for each question
- Also when "Repeat Question" button is clicked

**Request:**
```json
{
  "text": "You mentioned that folklore is 'passed down through generations.' Can you explain how this transmission process relates to the concept of Worldview that you discussed?"
}
```

**What it does:**
- Sends question text to ElevenLabs API
- Converts text to speech using configured voice
- Returns MP3 audio file
- Client plays audio via `HTMLAudioElement`

**Response:**
```
Binary audio data (audio/mpeg)
```

**External API Called:** ElevenLabs Text-to-Speech API
**Cost:**
- Free tier: 10,000 chars/month (~33 questions)
- ~100 chars per question  3 questions = ~300 chars per exam
**Implementation:** [src/app/api/tts/route.ts](../src/app/api/tts/route.ts)

**Voice Configuration:**
```env
ELEVENLABS_VOICE_ID=Hh0rE70WfnSFN80K8uJC  # From .env
```

---

#### = **Call #7: Save Question Answer Recording**

**Endpoint:** `POST /api/recordings`
**Trigger:** `nextQuestion()`  `captureQuestionAnswer(questionIndex)`
**Location:** [page.tsx:533](../src/app/page.tsx#L533)

**Request:**
```typescript
FormData {
  audio: File (audio/webm, 1-2 minutes per answer)
  context: "question-1" | "question-2" | "question-3"
}
```

**What it does:**
- Same as Call #1 (presentation recording)
- Saves each answer as separate file
- Filenames:
  - `2025-10-20T12-41-23_question-1_b2c3d4e5.webm`
  - `2025-10-20T12-43-45_question-2_c3d4e5f6.webm`
  - `2025-10-20T12-45-12_question-3_d4e5f6g7.webm`

**Response:**
```json
{
  "success": true,
  "fileName": "2025-10-20T12-41-23_question-1_b2c3d4e5.webm",
  "relativePath": "recordings/2025-10-20T12-41-23_question-1_b2c3d4e5.webm"
}
```

**Called:** 3 times (once per question)
**Implementation:** [src/app/api/recordings/route.ts](../src/app/api/recordings/route.ts)

---

#### = **Call #8: Transcribe Question Answer**

**Endpoint:** `POST /api/transcribe`
**Trigger:** `captureQuestionAnswer(questionIndex)`  `transcribeAudio(blob)`
**Location:** [page.tsx:543](../src/app/page.tsx#L543)

**Request:**
```typescript
FormData {
  audio: File (audio/webm, question answer)
}
```

**What it does:**
- Same as Call #2 (presentation transcription)
- Transcribes student's answer using Whisper
- Stores answer text in state: `questionAnswers[questionIndex]`

**Response:**
```json
{
  "text": "Worldview shapes how people interpret and pass down folklore because it provides the cultural framework..."
}
```

**Called:** 3 times (once per question)
**External API Called:** OpenAI Whisper API
**Cost:** ~$0.006 per minute  3 answers = ~$0.01-0.02
**Implementation:** [src/app/api/transcribe/route.ts](../src/app/api/transcribe/route.ts)

---

### **STAGE 8: Complete & Save**

When admin clicks "End Exam", all data is saved to Airtable.

---

#### = **Call #9: Generate Question Rationales**

**Endpoint:** `POST /api/question-rationale`
**Trigger:** `saveToAirtable()`  rationale generation (internal)
**Location:** [src/app/api/airtable/save/route.ts:60](../src/app/api/airtable/save/route.ts#L60)

**Note:** This is called **server-to-server** from within `/api/airtable/save`, not directly from client.

**Request:**
```json
{
  "questions": [
    "You mentioned that folklore is 'passed down through generations.'...",
    "In your presentation, you touched on Ethnography as a method...",
    "Drawing on all three cards, how do informal traditions..."
  ],
  "transcript": "My name is Sarah Johnson. My cards are...",
  "cards": ["Folklore", "Ethnography", "Worldview"]
}
```

**What it does:**
- Uses GPT-4o-mini to analyze why each question was formulated
- Generates metacognitive explanations for pedagogical intent
- Returns array of rationales (one per question)

**Prompt approach:**
```
For each question, explain:
1. What aspect of the student's presentation it targets
2. What deeper understanding it's trying to assess
3. How it connects to course concepts or cards
4. What intellectual move it asks the student to make
```

**Response:**
```json
{
  "rationales": [
    "This question targets the student's understanding of transmission dynamics and asks them to connect two concepts they presented separately. It assesses whether they can integrate folklore's temporal aspect with worldview's interpretive framework.",
    "This question evaluates the student's grasp of ethnographic methodology and their ability to apply theoretical knowledge to practical documentation scenarios. It asks them to synthesize method with content.",
    "This stretch question requires synthesis across all three cards, pushing the student to articulate how informal cultural practices constitute and are constituted by collective identity formation."
  ]
}
```

**External API Called:** OpenAI GPT-4o-mini
**Cost:** ~$0.001-0.002
**Implementation:** [src/app/api/question-rationale/route.ts](../src/app/api/question-rationale/route.ts)

---

#### = **Call #10: Save to Airtable**

**Endpoint:** `POST /api/airtable/save`
**Trigger:** `endExam()`  `saveToAirtable()`
**Location:** [page.tsx:448](../src/app/page.tsx#L448)

**Request:**
```json
{
  "studentName": "Sarah Johnson",
  "studentCards": ["Folklore", "Ethnography", "Worldview"],
  "fullTranscript": "My name is Sarah Johnson. My cards are...",
  "questionsWithAnswers": [
    {
      "question": "You mentioned that folklore is 'passed down through generations.'...",
      "answer": "Worldview shapes how people interpret and pass down folklore...",
      "recordingFile": "recordings/2025-10-20T12-41-23_question-1_b2c3d4e5.webm"
    },
    {
      "question": "In your presentation, you touched on Ethnography as a method...",
      "answer": "An ethnographer would document folklore practices by observing...",
      "recordingFile": "recordings/2025-10-20T12-43-45_question-2_c3d4e5f6.webm"
    },
    {
      "question": "Drawing on all three cards, how do informal traditions...",
      "answer": "Informal traditions reflect identity by embodying shared values...",
      "recordingFile": "recordings/2025-10-20T12-45-12_question-3_d4e5f6g7.webm"
    }
  ],
  "recordingFiles": {
    "presentation": "recordings/2025-10-20T12-34-56_presentation_a1b2c3d4.webm",
    "questions": [
      "recordings/2025-10-20T12-41-23_question-1_b2c3d4e5.webm",
      "recordings/2025-10-20T12-43-45_question-2_c3d4e5f6.webm",
      "recordings/2025-10-20T12-45-12_question-3_d4e5f6g7.webm"
    ]
  }
}
```

**What it does:**

**Step 1:** Saves to **Transcripts table**
```typescript
{
  transcript: "My name is Sarah Johnson...",
  student_name: "Sarah Johnson",
  cards: "Folklore, Ethnography, Worldview", // comma-separated
  timestamp: "2025-10-20T12:45:00.000Z",
  final_questions: "Question 1: ...\n\nQuestion 2: ...\n\nQuestion 3: ..."
}
```

**Step 2:** Generates rationales (Call #9)

**Step 3:** Saves to **Questions table** (3 separate records)
```typescript
// Record 1
{
  text: "You mentioned that folklore is 'passed down through generations.'...",
  answer: "Worldview shapes how people interpret and pass down folklore...",
  generated_at: "2025-10-20T12:45:00.000Z",
  workflow: "transcription",
  selected_final: true,
  card_tags: "Folklore, Ethnography, Worldview",
  judge_rationale: "This question targets the student's understanding..."
}

// Record 2, 3... (similar structure)
```

**Response:**
```json
{
  "success": true,
  "transcriptId": "rec1234567890abcd",
  "questionIds": ["recQ1111111111111", "recQ2222222222222", "recQ3333333333333"],
  "recordingFiles": {
    "presentation": "recordings/2025-10-20T12-34-56_presentation_a1b2c3d4.webm",
    "questions": [...]
  }
}
```

**External API Called:** Airtable REST API
**Records Created:** 4 total (1 transcript + 3 questions)
**Cost:** Free tier
**Implementation:** [src/app/api/airtable/save/route.ts](../src/app/api/airtable/save/route.ts)

---

## Summary Statistics

### **Total API Calls Per Exam**

**Stage 5 (Stop Presentation):**
- 1 POST `/api/recordings` (presentation)
- 1 POST `/api/transcribe` (presentation)
- 1 POST `/api/extract-cards`
- 1 GET `/api/airtable/terms`
- 1 POST `/api/q-thinking`

**Stage 7 (Questions - per question  3):**
- 3 POST `/api/tts` (optional, bot mode only)
- 3 POST `/api/recordings` (answers)
- 3 POST `/api/transcribe` (answers)

**Stage 8 (Complete):**
- 1 POST `/api/question-rationale` (server-side)
- 1 POST `/api/airtable/save` (which creates 4 Airtable records)

**Total API calls:**
- **Without bot mode:** 14 calls
- **With bot mode:** 17 calls

---

## External API Cost Breakdown

Assuming 6-minute presentation + 3  1-minute answers:

| Service | Call | Cost per Exam |
|---------|------|---------------|
| **OpenAI Whisper** | Transcription (presentation) | $0.03-0.06 |
| **OpenAI Whisper** | Transcription (3 answers) | $0.01-0.02 |
| **OpenAI GPT-4o-mini** | Extract cards | $0.001 |
| **OpenAI GPT-4o-mini** | Question rationales | $0.001 |
| **OpenAI o3** | Question generation | $0.05-0.15 |
| **ElevenLabs** | TTS (bot mode, ~300 chars) | $0 (free tier) |
| **Airtable** | API calls | $0 (free tier) |
| **TOTAL** | | **$0.10-0.24 per exam** |

---

## Data Flow Diagram

```

                        CLIENT (Browser)                       
$
  MediaRecorder API  Blob (in RAM)                           
,
                          FormData upload
                         

                   SERVER (Next.js API Routes)                 
$
  /api/recordings        Local filesystem (recordings/)      
  /api/transcribe        OpenAI Whisper                       
  /api/extract-cards     OpenAI GPT-4o-mini                   
  /api/airtable/terms    Airtable (cards table)              
  /api/q-thinking        OpenAI o3/o1 (reasoning)            
  /api/tts              ElevenLabs                            
  /api/question-rationale  OpenAI GPT-4o-mini                
  /api/airtable/save    Airtable (transcripts + questions)   

                         
                         

                    PERSISTENT STORAGE                         
$
  Local Disk: recordings/*.webm                               
  Airtable:   transcripts table (1 record)                    
              questions table (3 records)                      

```

---

## Error Handling & Fallbacks

**Recording persistence fails:**
- Logs error but continues exam
- Recording reference will be `null`

**Transcription fails:**
- Returns empty string
- Exam continues with fallback questions

**Card extraction fails:**
- Sets `studentName = "Unknown Student"`
- Sets `studentCards = []`

**Card definitions unavailable:**
- Questions generated without card context
- Uses transcript only

**Question generation fails:**
- Falls back to generic questions:
  ```javascript
  [
    "Can you elaborate on the main concepts you presented?",
    "How do these ideas connect to the course material?",
    "What questions do you have about this topic?"
  ]
  ```

**TTS fails (bot mode):**
- Shows alert: "Text-to-speech is not available"
- Admin must read questions manually

**Rationale generation fails:**
- Empty rationales saved to Airtable
- Questions still saved successfully

**Airtable save fails:**
- Logs error
- Data remains in client state (can retry)

---

## Performance Considerations

**Slowest operations:**
1. **Question generation** (`/api/q-thinking`) - 15-30 seconds (o3 reasoning)
2. **Transcription** (`/api/transcribe`) - 3-8 seconds (6-minute audio)
3. **Card extraction** (`/api/extract-cards`) - 1-3 seconds

**Parallel opportunities:**
- Currently all calls are sequential
- Could parallelize:
  - Recording save + transcription
  - Card extraction + term definitions fetch
  - (But question generation needs transcript first)

**Caching opportunities:**
- Card definitions (rarely change)
- Could cache with 1-hour TTL

**Loading states:**
```javascript
setQuestionsLoading(true); // Shows spinner to user
// ... API calls ...
setQuestionsLoading(false);
```

---

## Security Notes

**API Keys (server-side only):**
-  `OPENAI_API_KEY` - Never exposed to client
-  `AIRTABLE_API_KEY` - Never exposed to client
-  `ELEVENLABS_API_KEY` - Never exposed to client

**Client data validation:**
- L No authentication (public exam system)
- L No rate limiting on API routes
-  Audio files accepted without scanning
-  No file size limits enforced

**Production recommendations:**
1. Add authentication middleware
2. Rate limit API routes (especially `/api/q-thinking`)
3. Validate audio file size/type
4. Scan uploads for malware
5. Use HTTPS only
