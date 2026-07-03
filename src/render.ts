/**
 * Turns a synthesized script into a finished vertical MP4:
 *   1. schedule the spoken lines onto a timeline (absolute word timings)
 *   2. render each frame headlessly via Chromium (window.__seek(t) + screenshot)
 *   3. mux the frames with every line's audio at its exact offset (ffmpeg)
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { config } from "./config.js";
import type { Script } from "./facts.js";
import type { SpokenLine } from "./tts.js";
import { pageHTML, W, H, FPS, type ScenePayload, type ScriptCue, type Shot, type Emphasis } from "./scene.js";

const INTRO = 1.4; // title-card hook before the first line
const GAP = 0.26; // beat between lines
const TAIL = 1.3; // hold after the last word

export interface Timeline {
  payload: ScenePayload;
  /** each line's audio and where it starts on the master timeline */
  audio: { path: string; at: number }[];
  thumbFrame: number;
}

/** Place lines end to end; derive absolute per-word cue timings, then cut the
 *  camera into shots (close-ups on the speaker, reaction cutaways, an intro
 *  hold and an outro pull-back) and schedule the slam keywords. */
export function schedule(script: Script, spoken: SpokenLine[]): Timeline {
  const cues: ScriptCue[] = [];
  const audio: { path: string; at: number }[] = [];
  let cursor = INTRO;

  for (const line of spoken) {
    const start = cursor;
    const end = start + line.duration;
    audio.push({ path: line.path, at: start });

    // absolute per-word timings; fall back to even split if TTS gave none
    let words;
    if (line.words.length) {
      // the TTS word-boundaries drop punctuation/casing; when the token count
      // matches, show the ORIGINAL words (keeps "THREE?", "tired!", etc.)
      const orig = line.text.split(/\s+/).filter(Boolean);
      const useOrig = orig.length === line.words.length;
      words = line.words.map((w, i) => ({
        text: useOrig ? orig[i] : w.text,
        start: start + w.start,
        end:
          start +
          (i + 1 < line.words.length ? line.words[i + 1].start : line.words[i].start + line.words[i].dur),
      }));
    } else {
      const toks = line.text.split(/\s+/).filter(Boolean);
      const per = line.duration / Math.max(1, toks.length);
      words = toks.map((text, i) => ({ text, start: start + i * per, end: start + (i + 1) * per }));
    }
    cues.push({ speaker: line.speaker, start, end, words });
    cursor = end + GAP;
  }

  const duration = cursor - GAP + TAIL;
  const frames = Math.ceil(duration * FPS);

  // --- camera shots ---
  const shots: Shot[] = [{ start: 0, end: INTRO, cam: "wide", z0: 1.12, z1: 1.04 }];
  cues.forEach((c, i) => {
    const side: Shot["cam"] = c.speaker === "caveman" ? "left" : "right";
    const other: Shot["cam"] = c.speaker === "caveman" ? "right" : "left";
    const dur = c.end - c.start;
    if (i === 0) {
      shots.push({ start: c.start, end: c.end, cam: "wide", z0: 1.02, z1: 1.12 }); // establish both
    } else if (i === cues.length - 1) {
      shots.push({ start: c.start, end: duration, cam: "wide", z0: 1.14, z1: 1.0 }); // outro pull-back
    } else if (dur > 2.8) {
      const a = c.start + dur * 0.58;
      const b = a + Math.min(0.95, dur * 0.24);
      shots.push({ start: c.start, end: a, cam: side, z0: 1.5, z1: 1.6 });
      shots.push({ start: a, end: b, cam: other, z0: 1.62, z1: 1.55 }); // cut to the listener's reaction
      shots.push({ start: b, end: c.end, cam: side, z0: 1.5, z1: 1.6 });
    } else {
      const inn = i % 2 === 0; // alternate push-in / drift-out for rhythm
      shots.push({ start: c.start, end: c.end, cam: side, z0: inn ? 1.48 : 1.64, z1: inn ? 1.62 : 1.5 });
    }
  });

  // --- slam keywords: the fact on the reveal line, the CTA on the last ---
  const emphasis: Emphasis[] = [];
  const reveal = cues[1];
  if (reveal) {
    const s = reveal.start + 0.6;
    emphasis.push({ text: script.emphasis, start: s, end: Math.min(reveal.end + 0.2, s + 1.8) });
  }
  const last = cues[cues.length - 1];
  if (last) emphasis.push({ text: "FOLLOW FOR MORE", start: last.start + 0.35, end: duration - 0.15 });

  // thumbnail: mid-reveal, during the slam
  const thumbFrame = Math.round((reveal ? (reveal.start + reveal.end) / 2 : INTRO) * FPS);

  return {
    payload: { topic: script.topic, title: script.title, duration, frames, introEnd: INTRO, cues, shots, emphasis },
    audio,
    thumbFrame,
  };
}

function mux(framesDir: string, audio: { path: string; at: number }[], duration: number, outPath: string): Promise<void> {
  const args = ["-y", "-framerate", String(FPS), "-i", `${framesDir}/f_%05d.jpg`];
  for (const a of audio) args.push("-i", a.path);

  let fc = "";
  const labels: string[] = [];
  audio.forEach((a, i) => {
    const ms = Math.round(a.at * 1000);
    fc += `[${i + 1}:a]adelay=${ms}:all=1,volume=2.0[a${i}];`;
    labels.push(`[a${i}]`);
  });
  fc += `${labels.join("")}amix=inputs=${audio.length}:normalize=0:dropout_transition=0[a]`;

  args.push(
    "-filter_complex", fc,
    "-map", "0:v", "-map", "[a]",
    "-t", String(duration),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
    "-movflags", "+faststart", outPath
  );

  const proc = spawn(ffmpegPath as unknown as string, args, { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  proc.stderr!.on("data", (d) => (err += d));
  return new Promise((resolve, reject) =>
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-800)}`))))
  );
}

export interface Rendered {
  path: string;
  thumbPath?: string;
  duration: number;
}

export async function render(script: Script, spoken: SpokenLine[]): Promise<Rendered> {
  const slug = script.id.replace(/[^a-z0-9]/gi, "_");
  const framesDir = join(config.outDir, `frames-${slug}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const outPath = join(config.outDir, `factbot-${slug}.mp4`);
  const thumbPath = join(config.outDir, `factbot-${slug}-thumb.jpg`);

  const { payload, audio, thumbFrame } = schedule(script, spoken);
  const html = pageHTML(payload);

  const t0 = Date.now();
  const browser = await chromium.launch({
    args: ["--force-color-profile=srgb", "--hide-scrollbars", "--disable-lcd-text"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("  page-exc:", e.message));
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("window.__ready === true", { timeout: 30000 });

    for (let f = 0; f < payload.frames; f++) {
      const t = f / FPS;
      await page.evaluate((tt) => (window as any).__seek(tt), t);
      const buf = await page.screenshot({ type: "jpeg", quality: 90 });
      writeFileSync(join(framesDir, `f_${String(f).padStart(5, "0")}.jpg`), buf);
      if (f === thumbFrame) writeFileSync(thumbPath, buf);
    }
  } finally {
    await browser.close();
  }

  await mux(framesDir, audio, payload.duration, outPath);
  rmSync(framesDir, { recursive: true, force: true });
  console.log(`🎬 rendered ${payload.frames} frames (${payload.duration.toFixed(1)}s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return { path: outPath, thumbPath: existsSync(thumbPath) ? thumbPath : undefined, duration: payload.duration };
}
