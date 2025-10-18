# Oral Exam System

A Next.js application for conducting oral examinations with AI-powered question generation, real-time transcription, and text-to-speech capabilities.

## Overview

This system provides a complete workflow for oral exams:
1. **Preparation Phase**: Students draw cards and prepare (5-7.5 minutes)
2. **Recording Phase**: Students state their name and cards
3. **Presentation Phase**: Students present (4-6 minutes optimal, auto-stops at 6:10)
4. **Question Phase**: AI-generated follow-up questions (3 questions, 60s each)
5. **Completion**: Congratulations message and session end

## Key Features

### 🎯 Dual-Screen Interface
- **Admin Controls**: Manage exam flow, timers, and controls
- **Student View**: Clean display with prompts and timers
- Designed for projection or dual-monitor setup

### 🎤 Audio Recording & Transcription
- Browser-based audio recording
- OpenAI Whisper transcription
- Automatic question generation from presentation

### 🤖 AI-Powered Questions
- **Dual Workflow System**: Combines recording analysis with real-time insights
- **Pedagogically Designed**: Scaffolding questions (Q1-2) + stretch goal (Q3)
- **Context-Aware**: Uses student's selected cards and course syllabus
- **Final Judge**: Synthesizes best questions from multiple approaches

### 🔊 Text-to-Speech (Bot Mode)
- ElevenLabs integration for natural voice
- Auto-reads questions in bot mode
- Repeat question button for clarity

### 💾 Airtable Integration
- Stores card definitions
- Saves transcripts and questions
- Enables longitudinal analysis

### ⏱️ Smart Timers
- Prep countdown (5min or 7.5min with accommodation)
- Presentation timer with color coding:
  - 🔴 Red: < 4:00 or > 6:00
  - 🟢 Green: 4:00 - 6:00 (optimal range)
- Question timers (60s each)

## Tech Stack

- **Framework**: Next.js 15.5.4 (App Router)
- **Language**: TypeScript 5
- **Styling**: Inline styles (no external CSS dependencies)
- **AI APIs**:
  - OpenAI Whisper (transcription)
  - OpenAI GPT-4 (question generation)
  - ElevenLabs (text-to-speech)
- **Database**: Airtable
- **Audio**: MediaRecorder API (browser-native)

## Getting Started

### Prerequisites

- Node.js 20+
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- Airtable account ([sign up](https://airtable.com))
- ElevenLabs API key ([get one here](https://elevenlabs.io))

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd gened1196interview
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your API keys:
   ```env
   # OpenAI
   OPENAI_API_KEY=sk-your-key-here
   
   # Airtable
   AIRTABLE_API_KEY=pat...
   AIRTABLE_BASE_ID=app...
   AIRTABLE_CARDS_TABLE=cards
   AIRTABLE_TRANSCRIPTS_TABLE=transcripts
   AIRTABLE_QUESTIONS_TABLE=questions
   
   # ElevenLabs (for bot mode)
   ELEVENLABS_API_KEY=sk_...
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Rachel voice (default)
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open the application**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage Guide

### Exam Flow

#### Stage 1: Prep Time Selection
- Admin selects **5 Minutes** or **7.5 Minutes** (accommodation)
- Student sees: "Draw four (4) cards from each of the three stacks"
- Admin can click **"✓ Student Ready"** to skip remaining time

#### Stage 2: Prep Countdown
- Timer counts down from selected time
- Student prepares with cards and notes
- Auto-advances when timer reaches 0:00

#### Stage 3: Recording Prompt
- Admin clicks **"🔴 Start Recording"**
- Microphone permission requested
- Recording begins

#### Stage 4: Recording Name
- Student sees: "State your name and your selected cards"
- Recording is active (no timer yet)
- Admin clicks **"▶️ Start Timer"** when student is ready to present

#### Stage 5: Presentation
- Timer counts up from 0:00 to 6:10
- Color coding:
  - Red: < 4:00 (too short)
  - Green: 4:00 - 6:00 (perfect!)
  - Red: > 6:00 (too long)
- Auto-stops at 6:10 or admin clicks "Stop Recording"
- Questions generated from transcript

#### Stage 6: Question Mode Selection
- Admin selects:
  - **👤 Human**: Admin reads questions manually
  - **🤖 Bot**: Questions read aloud via text-to-speech

#### Stage 7: Questions
- 3 questions displayed one at a time
- Each question has:
  - 60-second timer (optional)
  - "Next Question" button (Q1-2)
  - "End Exam" button (Q3)
- Bot mode: Questions auto-read, "Repeat Question" button available

#### Stage 8: Complete
- Student sees: "🎉 Congratulations! You're done!"
- Admin sees: "✅ Exam Complete!" with "Start New Exam" button

### Question Modes

**Human Mode:**
- Admin reads questions aloud
- No audio playback
- Traditional exam format

**Bot Mode:**
- Questions automatically read via ElevenLabs
- Natural voice synthesis
- "Repeat Question" button for clarity
- Reduces admin workload

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── transcribe/         # Whisper transcription
│   │   │   ├── q-thinking/         # Question generation (recording)
│   │   │   ├── q-final-judge/      # Synthesizes best questions
│   │   │   ├── tts/                # Text-to-speech (ElevenLabs)
│   │   │   └── airtable/
│   │   │       ├── terms/          # Fetch card definitions
│   │   │       └── save/           # Save session data
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Main UI (stage-based workflow)
│   ├── lib/
│   │   └── airtable.ts             # Airtable utilities
│   ├── types/
│   │   └── index.ts                # TypeScript types
│   └── utils/
│       ├── audioRecorder.ts        # Audio recording
│       └── formatters.ts           # Time formatting
├── .env.example                    # Environment template
└── README.md                       # This file
```

## Configuration

### Presentation Timer Limits

Edit `src/app/page.tsx`:

```typescript
// Maximum presentation time (currently 6:10)
if (prev >= 370) { // 370 seconds = 6:10
  stopRecording();
  return 370;
}

// Color thresholds
if (presentationTime < 240) return "#ef4444"; // Red < 4min
if (presentationTime <= 360) return "#10b981"; // Green 4-6min
return "#ef4444"; // Red > 6min
```

### Question Timer

```typescript
// Question timer duration (currently 60s)
setQuestionTime(60); // Change to desired seconds
```

### Prep Times

```typescript
// Prep time options (currently 5 and 7.5 minutes)
<button onClick={() => startPrepTime(5)}>5 Minutes</button>
<button onClick={() => startPrepTime(7.5)}>7.5 Minutes</button>
```

### ElevenLabs Voice

Browse voices at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library)

Update `.env`:
```env
ELEVENLABS_VOICE_ID=your-chosen-voice-id
```

Popular voices:
- Rachel (default): `21m00Tcm4TlvDq8ikWAM` - Professional, clear
- Adam: `pNInz6obpgDQGcFmaJgB` - Deep, authoritative
- Bella: `EXAVITQu4vr4xnSDxMaL` - Warm, friendly

## Airtable Setup

### Required Tables

**1. cards**
- Fields: `term` (text), `definition` (long text)
- Stores course vocabulary and definitions

**2. transcripts**
- Fields: `student_name` (text), `transcript` (long text), `timestamp` (date)
- Stores presentation transcripts

**3. questions**
- Fields: `student_name` (text), `questions` (long text), `timestamp` (date)
- Stores generated questions

### API Access

1. Go to [airtable.com/account](https://airtable.com/account)
2. Generate a personal access token
3. Find your Base ID in the API documentation
4. Add to `.env`

## API Endpoints

### `POST /api/transcribe`
Transcribes audio using OpenAI Whisper
- **Input**: Audio file (FormData)
- **Output**: `{ text: string }`

### `POST /api/q-thinking`
Generates questions from transcript
- **Input**: `{ transcript: string, studentTerms: string[], scope: string }`
- **Output**: `{ questions: string }`

### `POST /api/q-final-judge`
Synthesizes best questions from multiple workflows
- **Input**: Multiple question sets
- **Output**: `{ questions: string }` (top 3)

### `POST /api/tts`
Converts text to speech
- **Input**: `{ text: string }`
- **Output**: Audio file (MP3)

### `GET /api/airtable/terms`
Fetches card definitions
- **Query**: `?terms=term1,term2,term3`
- **Output**: `{ definitions: { [term: string]: string } }`

### `POST /api/airtable/save`
Saves session data
- **Input**: `{ studentName, transcript, questions }`
- **Output**: `{ success: boolean }`

## Troubleshooting

### Microphone Not Working
- Grant browser microphone permissions
- Use HTTPS in production (localhost works in dev)
- Check browser console for errors

### Transcription Fails
- Verify OpenAI API key in `.env`
- Check API key has Whisper access
- Check browser console for error details (status code, message)
- Ensure audio file < 25MB

### Questions Not Generating
- Verify OpenAI API key
- Check API quota/limits
- Review console for API errors
- Ensure transcript is not empty

### Text-to-Speech Not Working
- Verify ElevenLabs API key in `.env`
- Check API quota (free tier: 10k chars/month)
- Ensure bot mode is selected
- Check browser audio permissions

### Timer Colors Wrong
- Verify color thresholds in `getPresentationTimerColor()`
- Check timer is counting correctly
- Refresh browser

## Security Notes

- ✅ `.env` file is gitignored (never commit API keys)
- ✅ API keys only used server-side (Next.js API routes)
- ✅ No audio permanently stored
- ✅ Ephemeral sessions for real-time APIs
- ⚠️ Always use HTTPS in production

## Cost Estimates

### OpenAI (per exam session)
- Whisper transcription: ~$0.01-0.03 (6 min audio)
- GPT-4 question generation: ~$0.05-0.10
- **Total**: ~$0.06-0.13 per exam

### ElevenLabs (bot mode only)
- ~300 characters per session (3 questions)
- Free tier: 10,000 chars/month (~33 sessions)
- Starter ($5/mo): 30,000 chars (~100 sessions)

### Airtable
- Free tier: 1,200 records/base
- Plus ($10/mo): 5,000 records/base

## Browser Compatibility

✅ Chrome/Edge 90+ (recommended)  
✅ Firefox 88+  
✅ Safari 14+ (requires HTTPS for microphone)  
⚠️ Mobile browsers (limited support)

## Development

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
npm run start
```

### Type Checking
```bash
npm run type-check
```

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [Next.js](https://nextjs.org)
- Powered by [OpenAI](https://openai.com)
- Voice by [ElevenLabs](https://elevenlabs.io)
- Data storage by [Airtable](https://airtable.com)

## Support

For issues or questions:
- Open an issue in this repository
- Check browser console for error details
- Review this README for configuration help

---

**Made for oral examinations in educational settings** 🎓
