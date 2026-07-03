# FactBots 🤖🦴

YouTube Shorts automation. **CARL** the robot explains a random fact; **JOHN**
the caveman reacts. Two distinct voices, word-by-word karaoke subtitles, hand-built
2D characters, and **edited like a real Short** — an intro hook card, hard cuts
between close-ups, reaction cutaways, push-ins, and a big "slam" keyword on the
reveal to keep eyes locked. Fully local, **zero paid APIs**.

To rename the two characters, edit `src/scene.ts` (the `NAME` map + the two
`.nameplate` labels) **and** their spoken names in the dialogue in `src/facts.ts`
(they address each other by name, so the names are baked into the script text).

## What it does

1. Picks the next fact from a curated bank (`src/facts.ts`), rotating so it never
   repeats until the whole bank has run.
2. Synthesizes each dialogue line with a per-character neural voice **and** real
   per-word timings (free Microsoft Edge TTS, no key) — `src/tts.ts`.
3. Cuts a 1080×1920 30fps vertical video: intro hook card, shot cuts between
   speaker close-ups, reaction cutaways, camera push-ins, a big slam keyword on
   the reveal, a follow-for-more outro, and karaoke captions in sync with the
   audio (headless Chromium frame capture + ffmpeg) — `src/scene.ts`, `src/render.ts`.
4. Optionally uploads it to YouTube as a Short — `src/youtube.ts`.

Everything is deterministic: each video frame is a pure function of time, so the
render is reproducible.

## Setup

```bash
npm install          # ffmpeg + Chromium come bundled (no system installs)
```

## Render one (no upload)

```bash
npm run render                       # next fact in rotation
npm run render -- --fact=honey-never-spoils   # a specific bit
```

The MP4 lands in `out/`. Review it before publishing.

## Auto-upload to YouTube

1. Google Cloud console (free): create a project, enable **YouTube Data API v3**,
   OAuth consent screen = External + add yourself as a Test user, then create an
   OAuth **Web application** client with redirect URI
   `http://localhost:8089/callback`.
2. Copy `.env.example` → `.env` and fill in `YT_CLIENT_ID` / `YT_CLIENT_SECRET`.
3. Mint a refresh token (opens your browser — **pick the account that owns the
   channel**):
   ```bash
   npm run auth
   ```
   Paste the printed `YT_REFRESH_TOKEN` into `.env`.
4. Publish:
   ```bash
   npm run make          # render + upload the next fact
   ```
   Visibility defaults to `unlisted` (`YT_PRIVACY` in `.env`; set `public` when happy).

## Automate it (daily)

Once upload works, schedule `npm run make` however you like (cron, launchd, a
GitHub Action). Each run advances the rotation, so a daily job posts a fresh fact.

## Customizing

- **Facts / dialogue** — add entries to the `FACTS` array in `src/facts.ts`.
- **Characters / look** — `src/scene.ts` (SVGs + CSS, all inline).
- **Voices** — `src/tts.ts`. Run `npm run voices` to list what the free endpoint
  currently serves. NOTE: Microsoft retires voices without notice (e.g. `Davis`,
  `Tony` are dead) — if a run errors with "returned no audio", pick another.

## Why msedge-tts is pinned to 2.0.5

2.0.6 has a regression: when a voice returns empty word-boundary metadata it
rejects the whole request **and** crashes the process on an unguarded
`unlinkSync`. 2.0.5 is stable; `src/tts.ts` also drives the streaming API
directly so empty metadata degrades to an even-split caption instead of failing.
