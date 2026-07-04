/**
 * The content engine. Facts live as compact "seeds" in src/factbank.ts — each
 * seed carries the tailored bits that make a bit land (JOHN's hook, the reveal
 * CARL delivers, and JOHN's two reactions), and this file assembles them into
 * full 6-line scripts with a rotating sign-off.
 *
 * CARL the robot explains; JOHN the caveman reacts. The reveal line (index 1)
 * is what the renderer punches the big "slam" keyword over.
 *
 * Rotation: a local run walks a persisted cursor (out/state.json); the cloud
 * runner is stateless and picks by the clock — see scriptForSlot + src/index.ts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { config } from "./config.js";
import { SEEDS } from "./factbank.js";

export type Speaker = "robot" | "caveman";

export interface Line {
  speaker: Speaker;
  text: string;
}

export interface Script {
  id: string;
  topic: string;
  title: string;
  emphasis: string;
  lines: Line[];
}

const R = (text: string): Line => ({ speaker: "robot", text });
const C = (text: string): Line => ({ speaker: "caveman", text });

/** CARL's sign-offs, rotated so the closer never feels canned. */
const CTAS = [
  "Follow for more, humans.",
  "Now you know. Follow for more.",
  "Stay curious. Follow for more, humans.",
  "Your brain grew today. Follow for more.",
  "Science is wild. Follow for more, humans.",
  "More facts await. Follow, humans.",
  "Knowledge complete. Follow for more.",
  "Fascinating, yes? Follow for more, humans.",
];

const FACTS: Script[] = SEEDS.map((s, i) => ({
  id: s.id,
  topic: s.topic,
  title: s.title,
  emphasis: s.emphasis,
  lines: [
    C(s.hook),
    R(s.fact),
    C(s.react),
    R(s.detail),
    C(s.react2),
    R(CTAS[i % CTAS.length]),
  ],
}));

// fail loud on a duplicate id (would break rotation/dedup)
{
  const seen = new Set<string>();
  for (const f of FACTS) {
    if (seen.has(f.id)) throw new Error(`duplicate fact id: "${f.id}"`);
    seen.add(f.id);
  }
}

const STATE = join(config.outDir, "state.json");

interface State {
  index: number;
}

function readState(): State {
  try {
    if (existsSync(STATE)) return JSON.parse(readFileSync(STATE, "utf8")) as State;
  } catch {
    /* corrupt state → start fresh */
  }
  return { index: 0 };
}

function writeState(s: State): void {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2));
}

/** Pick the next fact in rotation and advance the cursor (local runs). */
export function nextScript(forceId?: string): Script {
  if (forceId) {
    const f = FACTS.find((x) => x.id === forceId);
    if (!f) throw new Error(`no fact with id "${forceId}"`);
    return f;
  }
  const s = readState();
  const idx = ((s.index % FACTS.length) + FACTS.length) % FACTS.length;
  const fact = FACTS[idx];
  writeState({ index: idx + 1 });
  return fact;
}

/** Stateless rotation for the cloud runner (slot derived from the clock). */
export function scriptForSlot(slot: number): Script {
  const len = FACTS.length;
  return FACTS[((slot % len) + len) % len];
}

export function allFactIds(): string[] {
  return FACTS.map((f) => f.id);
}

export function factCount(): number {
  return FACTS.length;
}
