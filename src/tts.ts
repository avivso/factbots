/**
 * Two-voice TTS. Each dialogue line is synthesized with the voice for its
 * speaker (RUON the robot vs THAG the caveman), silence-trimmed to a
 * sample-exact WAV, and returned with the TTS's REAL per-word timings so the
 * captions track the audio word by word.
 *
 * Free + local: Microsoft Edge's online TTS via msedge-tts (no API key).
 *
 * We drive the low-level toStream() API (not toFile) on purpose: toFile couples
 * audio and word-boundary metadata into one Promise.all and, if a voice returns
 * empty metadata, it both loses the audio AND crashes on an unguarded
 * unlinkSync. Consuming the streams ourselves lets empty metadata degrade
 * gracefully to an even-split caption instead.
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { spawnSync } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import ffmpegPath from "ffmpeg-static";
import type { Line, Speaker } from "./facts.js";

/** Distinct, clearly-different neural voices + prosody per character.
 *  Robot: crisp, measured, faintly clipped. Caveman: deep, slow, gruff.
 *  (Brian/Andrew multilingual voices are intentionally avoided.) */
const VOICE: Record<Speaker, { voice: string; rate: string; pitch: string }> = {
  robot: { voice: "en-US-EricNeural", rate: "+8%", pitch: "-6Hz" },
  caveman: { voice: "en-US-ChristopherNeural", rate: "-8%", pitch: "-12Hz" },
};

export interface Word {
  text: string;
  /** seconds from the start of THIS line's (trimmed) audio */
  start: number;
  dur: number;
}

export interface SpokenLine {
  speaker: Speaker;
  text: string;
  path: string;
  duration: number;
  words: Word[];
}

interface RawMeta {
  Type?: string;
  Data?: { Offset?: number; Duration?: number; text?: { Text?: string } };
}

/** exact WAV duration (seconds), parsed from ffmpeg's stderr. */
function audioDuration(path: string): number {
  const res = spawnSync(ffmpegPath as unknown as string, ["-i", path], { encoding: "utf8" });
  const m = res.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** WordBoundary entries → per-word timings, zero-based to the first word (so
 *  they line up with the silence-trimmed clip). */
function toWords(meta: RawMeta[]): Word[] {
  const wb = meta
    .filter((m) => m.Type === "WordBoundary")
    .map((m) => ({
      text: String(m.Data?.text?.Text ?? ""),
      start: (m.Data?.Offset ?? 0) / 1e7,
      dur: (m.Data?.Duration ?? 0) / 1e7,
    }));
  if (!wb.length) return [];
  const base = wb[0].start;
  return wb.map((w) => ({ text: w.text, start: Math.max(0, w.start - base), dur: w.dur }));
}

/** Synthesize one line: stream audio to mp3, collect word-boundary metadata
 *  best-effort, then trim + normalize to a WAV. */
async function synthOne(tts: MsEdgeTTS, text: string, prosody: any, partDir: string): Promise<{ rawPath: string; meta: RawMeta[]; bytes: number }> {
  mkdirSync(partDir, { recursive: true });
  const rawPath = join(partDir, "audio.mp3");
  const { audioStream, metadataStream } = (await tts.toStream(text, prosody)) as {
    audioStream: Readable;
    metadataStream: Readable | null;
  };

  const meta: RawMeta[] = [];
  let bytes = 0;
  const audioDone = new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(rawPath);
    audioStream.on("data", (d: Buffer) => (bytes += d.length));
    audioStream.on("error", reject);
    ws.on("error", reject);
    ws.on("finish", () => resolve());
    audioStream.pipe(ws);
  });
  const metaDone = new Promise<void>((resolve) => {
    if (!metadataStream) return resolve();
    metadataStream.on("data", (chunk: Buffer) => {
      try {
        const o = JSON.parse(chunk.toString());
        if (Array.isArray(o?.Metadata)) meta.push(...o.Metadata);
      } catch {
        /* ignore malformed metadata chunks */
      }
    });
    metadataStream.on("end", () => resolve());
    metadataStream.on("close", () => resolve());
    metadataStream.on("error", () => resolve()); // empty/absent metadata is fine
  });

  // safety timeout so a stalled socket can't hang the whole run
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TTS stream timed out")), 30000)
  );
  await Promise.race([Promise.all([audioDone, metaDone]), timeout]);
  return { rawPath, meta, bytes };
}

/** Synthesize every line to its own trimmed WAV with per-word timings. */
export async function synthesize(lines: Line[], outDir: string): Promise<SpokenLine[]> {
  mkdirSync(outDir, { recursive: true });

  const conns = new Map<Speaker, MsEdgeTTS>();
  async function ttsFor(speaker: Speaker): Promise<MsEdgeTTS> {
    const cached = conns.get(speaker);
    if (cached) return cached;
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE[speaker].voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true,
    });
    conns.set(speaker, tts);
    return tts;
  }

  const out: SpokenLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tts = await ttsFor(line.speaker);
    const { rate, pitch } = VOICE[line.speaker];

    let raw: { rawPath: string; meta: RawMeta[]; bytes: number };
    try {
      raw = await synthOne(tts, line.text, { rate, pitch }, join(outDir, `tts-${i}`));
    } catch {
      // some prosody combos are rejected → retry flat
      raw = await synthOne(tts, line.text, {}, join(outDir, `tts-${i}`));
    }
    if (raw.bytes === 0) {
      throw new Error(
        `voice "${VOICE[line.speaker].voice}" returned no audio — it was likely retired ` +
          `from the free Edge endpoint. Run \`npm run voices\` and pick another in src/tts.ts.`
      );
    }

    const partPath = join(outDir, `line-${i}.wav`);
    const trim = spawnSync(ffmpegPath as unknown as string, [
      "-y", "-i", raw.rawPath,
      "-af",
      "silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.03," +
        "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.03,areverse," +
        "loudnorm=I=-16:TP=-1.5",
      "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le",
      partPath,
    ]);
    if (trim.status !== 0) {
      throw new Error(`ffmpeg trim failed for line ${i}: ${String(trim.stderr).slice(-400)}`);
    }
    const duration = audioDuration(partPath);
    if (duration <= 0) throw new Error(`line ${i} produced empty audio`);

    out.push({ speaker: line.speaker, text: line.text, path: partPath, duration, words: toWords(raw.meta) });
  }
  return out;
}
