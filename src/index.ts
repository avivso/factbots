/**
 * Orchestrator: pick the next fact → two-voice TTS → render the vertical MP4 →
 * (optionally) upload to YouTube as a Short.
 *
 *   npm run make                 # render + upload (if creds present)
 *   npm run render               # render only, never upload
 *   npm run make -- --fact=octopus-hearts   # force a specific bit
 */
import { mkdirSync } from "node:fs";
import { config, uploadConfigured } from "./config.js";
import { nextScript, scriptForSlot } from "./facts.js";
import { synthesize } from "./tts.js";
import { render } from "./render.js";
import { uploadShort } from "./youtube.js";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}
const noUpload = process.argv.includes("--no-upload");

function buildDescription(topic: string): { description: string; tags: string[] } {
  const tags = ["shorts", "facts", "didyouknow", "funfacts", "robot", "caveman", "science", "trivia", "education"];
  const description =
    "Carl the robot explains a wild fact. John the caveman is not ready for it. 🤖🦴\n\n" +
    "New facts every day. Follow for more!\n\n" +
    "#Shorts #Facts #DidYouKnow #FunFacts #" +
    topic.replace(/\s+/g, "");
  return { description, tags };
}

async function main() {
  mkdirSync(config.outDir, { recursive: true });

  // Fact selection: an explicit --fact wins; otherwise the cloud runner uses
  // stateless time-rotation (ROTATE=time) since its filesystem is ephemeral,
  // while a local run walks the persisted state-file rotation.
  const forced = arg("fact");
  let script;
  if (forced) {
    script = nextScript(forced);
  } else if (process.env.ROTATE === "time") {
    const slot = Math.floor(Date.now() / (4 * 3600 * 1000)); // one per 4h bucket
    script = scriptForSlot(slot);
    console.log(`   (time-rotation slot ${slot})`);
  } else {
    script = nextScript();
  }
  console.log(`📝 fact: "${script.id}" — ${script.title}`);
  console.log(`   topic: ${script.topic}, lines: ${script.lines.length}`);

  console.log("🎙️  synthesizing two voices...");
  const spoken = await synthesize(script.lines, config.outDir);

  console.log("🎬 rendering...");
  const video = await render(script, spoken);
  console.log(`✅ video: ${video.path}`);

  const wantUpload = !noUpload && !config.dryRun;
  if (!wantUpload) {
    console.log("⏭️  upload skipped (render-only). Review the MP4, then run `npm run make`.");
    return;
  }
  if (!uploadConfigured()) {
    console.log("⚠️  upload requested but YT creds are missing. Run `npm run auth` first.");
    console.log(`   Rendered locally at: ${video.path}`);
    return;
  }

  console.log(`⬆️  uploading to YouTube (${config.privacy})...`);
  const { description, tags } = buildDescription(script.topic);
  const url = await uploadShort(video.path, {
    title: `${script.title} #Shorts`,
    description,
    tags,
    thumbPath: video.thumbPath,
  });
  console.log(`🚀 published: ${url}`);
}

main().catch((err) => {
  console.error("❌ failed:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
