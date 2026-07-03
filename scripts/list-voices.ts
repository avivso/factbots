/**
 * Print available English neural voices (name + gender + locale) so you can
 * swap RUON/THAG for a different pairing in src/tts.ts.
 *   npm run voices
 */
export {};
const LIST =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

const r = await fetch(LIST);
const voices = (await r.json()) as { ShortName: string; Gender: string; Locale: string; FriendlyName: string }[];
const en = voices
  .filter((v) => v.Locale.startsWith("en-"))
  .sort((a, b) => a.Locale.localeCompare(b.Locale) || a.ShortName.localeCompare(b.ShortName));

for (const v of en) {
  console.log(`${v.ShortName.padEnd(28)} ${v.Gender.padEnd(7)} ${v.Locale.padEnd(7)} ${v.FriendlyName}`);
}
console.log(`\n${en.length} English voices. Current: robot=en-US-EricNeural, caveman=en-US-DavisNeural`);
