# Repository Map

## Top Level
- `README.md` — project overview and setup instructions.
- `LICENSE` — legal terms for using the project.
- `package.json` / lock files (`package-lock.json`, `pnpm-lock.yaml`) — dependency manifests.
- `tsconfig.json` — TypeScript compiler configuration.
- `next-env.d.ts` — Next.js ambient type definitions.
- `.env.local` (not tracked) — local runtime configuration.

## `src/`
- `app/` — Next.js App Router entry point.
  - `layout.tsx` — root layout shell shared across pages.
  - `page.tsx` — primary landing page implementation.
  - `page.backup.tsx` — alternate copy of the landing page.
  - `api/` — serverless route handlers.
    - `airtable/save/route.ts` — persists Airtable records.
    - `airtable/terms/route.ts` — retrieves Airtable glossary/terms.
    - `extract-cards/route.ts` — builds study cards from responses.
    - `q-basic/route.ts` — baseline question generation.
    - `q-final/route.ts` — final question set creation.
    - `q-final-judge/route.ts` — evaluates final responses.
    - `q-judge/route.ts` — intermediate response evaluation.
    - `q-thinking/route.ts` — guided reasoning prompts.
    - `question-rationale/route.ts` — creates rationale text.
    - `realtime-session/route.ts` — manages real-time session connects.
    - `transcribe/route.ts` — audio transcription endpoint.
    - `tts/route.ts` — text-to-speech synthesis.
  - `layout.tsx` — top-level layout component.
- `config/constants.ts` — shared configuration values.
- `lib/airtable.ts` — Airtable client helpers.
- `types/index.ts` — shared TypeScript types.
- `utils/` — client-side helper utilities.
  - `audioRecorder.ts` — wrapper around browser audio recording.
  - `formatters.ts` — formatting helpers.

## `public/`
- Static assets used by the frontend (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`).

