/**
 * The content engine. A curated bank of genuinely interesting facts, each
 * written as a short two-character bit: CARL the robot explains, JOHN the
 * caveman reacts. Hand-written per fact so the comedy lands (procedural
 * caveman reactions read like a screen reader).
 *
 * `emphasis` is the big "slam" keyword the editor punches on screen during the
 * reveal — the eye-grabbing payoff.
 *
 * Rotation is persisted in out/state.json so repeat runs walk the whole bank
 * before looping — the automation never posts the same fact twice in a row.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { config } from "./config.js";

export type Speaker = "robot" | "caveman";

export interface Line {
  speaker: Speaker;
  text: string;
}

export interface Script {
  id: string;
  /** short label shown in the on-screen topic chip */
  topic: string;
  /** YouTube title */
  title: string;
  /** big "slam" keyword punched on screen during the reveal */
  emphasis: string;
  lines: Line[];
}

/** robot = CARL, caveman = JOHN. Keep lines short — they become spoken
 *  TTS and word-by-word captions, so ~1 sentence per line reads best. */
const R = (text: string): Line => ({ speaker: "robot", text });
const C = (text: string): Line => ({ speaker: "caveman", text });

const FACTS: Script[] = [
  {
    id: "octopus-hearts",
    topic: "ANIMALS",
    title: "An octopus has THREE hearts?!",
    emphasis: "3 HEARTS",
    lines: [
      C("Carl! Why octopus so weird?"),
      R("Because an octopus has three hearts, John."),
      C("THREE? John only have one, and it tired!"),
      R("Two pump blood to the gills. One pumps to the body."),
      R("And that main heart stops beating when it swims."),
      C("So when it swim, it almost DIE? No wonder it walk!"),
      R("Correct. Swimming exhausts it. Follow for more, humans."),
    ],
  },
  {
    id: "honey-never-spoils",
    topic: "FOOD",
    title: "Honey NEVER expires",
    emphasis: "NEVER SPOILS",
    lines: [
      C("John find old honey in cave. Still good?"),
      R("If it is sealed, yes. Honey never spoils."),
      C("Never? John meat go bad in one sun!"),
      R("Honey has almost no water and is slightly acidic."),
      R("Archaeologists found three-thousand-year-old honey still edible."),
      C("John would eat pharaoh honey. No shame."),
      R("A bold choice. Follow for more, humans."),
    ],
  },
  {
    id: "bananas-radioactive",
    topic: "SCIENCE",
    title: "Bananas are radioactive",
    emphasis: "RADIOACTIVE",
    lines: [
      C("Carl say banana is radio-active? What that mean?"),
      R("Bananas contain potassium, and some of it is radioactive."),
      C("John eat many banana! John glow now?!"),
      R("No. The dose is tiny. Your own body is radioactive too."),
      R("Scientists even joke about the Banana Equivalent Dose."),
      C("John heart glowing with fear AND banana."),
      R("You are perfectly safe. Follow for more, humans."),
    ],
  },
  {
    id: "sharks-older-trees",
    topic: "NATURE",
    title: "Sharks are older than trees",
    emphasis: "OLDER THAN TREES",
    lines: [
      C("Carl, what come first? Shark or tree?"),
      R("Sharks. They are older than trees, John."),
      C("Fish beat TREE? How?!"),
      R("Sharks appeared about four-hundred-fifty million years ago."),
      R("Trees came roughly three-hundred-fifty million years ago."),
      C("So shark saw world with NO forest. Just water and teeth."),
      R("A terrifying era. Follow for more, humans."),
    ],
  },
  {
    id: "wombat-cube-poop",
    topic: "ANIMALS",
    title: "Wombats poop cubes",
    emphasis: "CUBE POOP",
    lines: [
      C("Carl! This poop is a SQUARE?"),
      R("Yes. Wombats produce cube-shaped droppings."),
      C("Poop have CORNERS? Nature is showing off."),
      R("Their intestines shape it. Cubes do not roll away."),
      R("They stack it to mark their territory."),
      C("John respect any creature that decorate with poop."),
      R("A fine tribute. Follow for more, humans."),
    ],
  },
  {
    id: "eiffel-grows",
    topic: "HISTORY",
    title: "The Eiffel Tower grows in summer",
    emphasis: "GROWS 15cm",
    lines: [
      C("Carl, can a metal thing get taller by itself?"),
      R("The Eiffel Tower does, in summer."),
      C("It GROW? Like John's beard?"),
      R("Heat makes iron expand. It rises about fifteen centimeters."),
      R("In winter it shrinks back down."),
      C("A tower that stretch in sun. John also do this. Lazy."),
      R("Physics, not laziness. Follow for more, humans."),
    ],
  },
  {
    id: "space-hot-metal-welds",
    topic: "SPACE",
    title: "Metal welds itself in space",
    emphasis: "COLD WELDING",
    lines: [
      C("Carl, why you no touch other metal in sky?"),
      R("In space, two pieces of metal can weld on contact."),
      C("They STICK? Like John hand in tar pit?"),
      R("On Earth, air forms a layer that keeps them apart."),
      R("In a vacuum, there is no air, so they fuse."),
      C("So sky make metal friends forever. Sweet, and scary."),
      R("It is called cold welding. Follow for more, humans."),
    ],
  },
  {
    id: "cows-best-friends",
    topic: "ANIMALS",
    title: "Cows have best friends",
    emphasis: "BEST FRIENDS",
    lines: [
      C("Carl, do cow have friend like John have you?"),
      R("Yes. Cows form close friendships, John."),
      C("Cow have BEST friend? John emotional now."),
      R("Their heart rate drops when they are with that friend."),
      R("Separate them, and they get stressed."),
      C("John heart also drop when Carl near. In good way."),
      R("That is unexpectedly kind. Follow for more, humans."),
    ],
  },
  {
    id: "hot-water-freezes-faster",
    topic: "SCIENCE",
    title: "Hot water can freeze faster than cold",
    emphasis: "MPEMBA EFFECT",
    lines: [
      C("Carl, to make ice fast, John use cold water, yes?"),
      R("Sometimes hot water freezes faster than cold."),
      C("That make NO sense to John brain!"),
      R("It is called the Mpemba effect."),
      R("Scientists still argue about exactly why."),
      C("Even smart ones confused? John feel better now."),
      R("Mystery keeps it fun. Follow for more, humans."),
    ],
  },
  {
    id: "your-nose-smells",
    topic: "HUMAN BODY",
    title: "Your nose remembers a trillion smells",
    emphasis: "1 TRILLION",
    lines: [
      C("Carl, how many smell John nose know?"),
      R("Humans can distinguish about one trillion smells."),
      C("A TRILLION? John only name two. Mammoth, and fire."),
      R("Smell is tied directly to memory and emotion."),
      R("One scent can drag back an entire lost moment."),
      C("John smell rain and remember baby John. Beautiful."),
      R("The nose is a time machine. Follow for more, humans."),
    ],
  },
  {
    id: "sun-white",
    topic: "SPACE",
    title: "The Sun is actually white",
    emphasis: "ACTUALLY WHITE",
    lines: [
      C("Carl, sun is yellow. John see with own eye!"),
      R("The Sun is actually white, John."),
      C("WHITE? John been lied to by sky!"),
      R("Our atmosphere scatters blue light, so it looks yellow."),
      R("From space, astronauts see it as pure white."),
      C("So sky paint the sun. Sneaky sky."),
      R("A cosmic filter. Follow for more, humans."),
    ],
  },
  {
    id: "tongue-print-unique",
    topic: "HUMAN BODY",
    title: "Your tongue print is unique",
    emphasis: "LIKE A FINGERPRINT",
    lines: [
      C("Carl, why you look at John tongue?"),
      R("Your tongue print is unique, like a fingerprint."),
      C("John tongue is ONE of a kind? John special!"),
      R("No two tongues share the same pattern of bumps."),
      R("Some researchers study it for identification."),
      C("John will sign cave wall with tongue now."),
      R("Please do not. Follow for more, humans."),
    ],
  },
  {
    id: "scotland-unicorn",
    topic: "HISTORY",
    title: "Scotland's national animal is a unicorn",
    emphasis: "A UNICORN",
    lines: [
      C("Carl, what animal rule the land of Scotland?"),
      R("A unicorn. It is Scotland's national animal."),
      C("A UNICORN? The horse with spike?!"),
      R("Yes. They chose a mythical beast on purpose."),
      R("It symbolized purity and untamed power."),
      C("John want national animal too. John pick angry goose."),
      R("A worthy rival. Follow for more, humans."),
    ],
  },
  {
    id: "clouds-heavy",
    topic: "NATURE",
    title: "A cloud can weigh a million pounds",
    emphasis: "1,000,000 LBS",
    lines: [
      C("Carl, cloud is soft. It weigh nothing, yes?"),
      R("A single cloud can weigh over a million pounds."),
      C("A MILLION? It float like feather!"),
      R("The weight is spread across billions of tiny droplets."),
      R("Each drop is small enough to stay in the air."),
      C("So the sky carry a mammoth herd, made of water."),
      R("Beautifully put. Follow for more, humans."),
    ],
  },
];

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

/**
 * Pick the next fact in rotation and advance the cursor. Pass an explicit id
 * to force a specific bit (useful for testing a single fact).
 */
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

export function allFactIds(): string[] {
  return FACTS.map((f) => f.id);
}

/**
 * Stateless rotation: pick a fact purely from a slot number. The cloud runner
 * has no persistent filesystem, so it derives the slot from the clock
 * (4-hour buckets) instead of a state file — see src/index.ts.
 */
export function scriptForSlot(slot: number): Script {
  const len = FACTS.length;
  return FACTS[((slot % len) + len) % len];
}

export function factCount(): number {
  return FACTS.length;
}
