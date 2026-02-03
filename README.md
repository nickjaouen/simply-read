# Book Chapter Text-to-Speech App

Convert DOCX book chapters into playable audio using OpenAI Text-to-Speech. The app lets you pick a chapter, voice, and model, generate audio with progress feedback, view the chapter text, and manage saved audio files (select, play/pause/seek, delete).

## Features
- Chapter picker (DOCX) with text preview.
- Voice picker plus model picker (`tts-1`, `tts-1-hd`).
- Generate chapter audio with animated status; generate a test clip (“This is a test for Nick”).
- Saved audio dropdown (shows chapter/voice/model), single visible player with play/pause/seek and delete.
- Audio files persisted in `public/audio/` with `manifest.json` to keep chapter/voice/model metadata.

## Prerequisites
- Node.js 18+ recommended.
- OpenAI API key in `.env` at repo root:
  ```
  OPENAI_API_KEY=your_key_here
  ```

## Setup
1. Install deps:
   ```bash
   npm install
   ```
2. Place chapters as `.docx` files in `chapters/` (example: `Chapter 1 - That Lingering Ache.docx`).

## Run
```bash
npm start
```
Then open http://localhost:3000

## Usage
1) Choose Chapter, Voice, Model.  
2) Click “Generate Audio” to synthesize the selected chapter (chunked to stay under the 4096-char TTS limit) or “Generate Test” for the fixed test phrase.  
3) Watch the status line for in-progress dots; the generated audio is saved to `public/audio/` and recorded in `public/audio/manifest.json`.  
4) Use the “Saved Audio” dropdown to pick an audio file (label shows chapter/voice/model; test clips labeled “Test Audio”). Only the selected audio’s controls show: play/pause, scrub bar, time readout, delete.  
5) Use “Show Text” in the audio detail (or select a chapter) to view the chapter text in the scrollable pane.

## Project structure
- `server.js` — Express server; lists chapters, parses DOCX via `mammoth`, chunks text, calls OpenAI TTS, saves MP3, maintains manifest, serves static UI, supports delete.
- `public/index.html`, `public/style.css`, `public/script.js` — UI, controls, status handling, saved-audio dropdown, player, delete, text preview.
- `chapters/` — Source DOCX chapters you provide.
- `public/audio/` — Generated MP3 files plus `manifest.json` metadata (audioUrl, chapter, voice, model, createdAt).
- `.env` — Must define `OPENAI_API_KEY`.

## Notes & troubleshooting
- DOCX required for chapter source (parsed via `mammoth` to plain text).
- TTS requests are chunked at ~3900 chars to avoid the 4096 limit.
- If chapter text fails to load, confirm the file exists in `chapters/` and the server is running.
- If audio generation fails, check `.env` for `OPENAI_API_KEY` and terminal logs for API errors.
- Delete via UI removes the MP3 from `public/audio/` and its manifest entry.
