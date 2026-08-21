/**
 * One-time (re-runnable) generation script: renders every clip in
 * VOICE_BANK_SLUGS (src/lib/tracking/voiceWords.ts) through ElevenLabs TTS
 * using a fixed library voice, and saves them as static mp3s under
 * public/audio/voice/. Run with `npm run voice:generate` after putting
 * ELEVENLABS_API_KEY in .env.local — that key is never committed and never
 * read by the app itself (this script lives outside src/, uses plain
 * fetch against the REST API, no SDK).
 *
 * Idempotent: skips any slug whose mp3 already exists, so re-running after
 * adding a new word only pays for what's missing. Delete a file to force
 * a re-render of just that clip (e.g. after tweaking voice settings).
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { WORD_BANK, VOICE_BANK_SLUGS } from "../src/lib/tracking/voiceWords";

const VOICE_ID = "9LwXyqQB0mUwtLRsS227"; // "Bianca" — PT-verified, professional
const OUT_DIR = new URL("../public/audio/voice/", import.meta.url);

function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function generateClip(text: string, apiKey: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status} for "${text}": ${await res.text()}`);
  }
  return res.arrayBuffer();
}

async function main(): Promise<void> {
  loadEnvLocal();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY missing from .env.local");
  }

  mkdirSync(OUT_DIR, { recursive: true });

  let generated = 0;
  let skipped = 0;
  for (const slug of VOICE_BANK_SLUGS) {
    const outPath = new URL(`${slug}.mp3`, OUT_DIR);
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }
    const text = WORD_BANK[slug];
    console.log(`generating "${slug}" ("${text}")...`);
    const audio = await generateClip(text, apiKey);
    writeFileSync(outPath, Buffer.from(audio));
    generated++;
    // ElevenLabs rate-limits aggressive back-to-back calls on lower tiers.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log(`done: ${generated} generated, ${skipped} already present (${VOICE_BANK_SLUGS.length} total).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
