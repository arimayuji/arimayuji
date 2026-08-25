/**
 * One-time (re-runnable) generation script: renders every clip in
 * VOICE_BANK (src/lib/tracking/voiceWords.ts) through ElevenLabs TTS,
 * using a fixed library voice and each entry's own previous/next-text
 * context, and saves them as static mp3s under
 * public/audio/<voice's outDir>/. Run with `npm run voice:generate`
 * (female/default) or `npm run voice:generate:male` after putting
 * ELEVENLABS_API_KEY in .env.local — that key is never committed and never
 * read by the app itself (this script lives outside src/, uses plain
 * fetch against the REST API, no SDK).
 *
 * Idempotent: skips any slug whose mp3 already exists, so re-running after
 * adding a new word (or after a previous run got cut off partway through,
 * e.g. by hitting the account's ElevenLabs quota) only pays for what's
 * missing. Delete a file to force a re-render of just that clip.
 *
 * `--normalize-only` skips ElevenLabs entirely and just re-levels whatever
 * mp3s already exist for the target voice (`npm run voice:normalize` /
 * `voice:normalize:male`) — no API key needed, no credits spent.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VOICE_BANK } from "../src/lib/tracking/voiceWords";

/**
 * Both real ElevenLabs shared-library voices (ids confirmed against the
 * account's own `/v1/shared-voices` API, not guessed), picked by ear from
 * preview samples before committing to a full render: "Bianca" was the
 * original PT-verified pick; "Rafael - Friendly Brazilian" is the male
 * voice picked the same way. `outDir` must match the `voiceGender`-keyed
 * base path voiceBank.ts reads from.
 */
const VOICES = {
  female: { id: "9LwXyqQB0mUwtLRsS227", outDir: "voice" },
  male: { id: "SoNeOcCfZTExy2jhBXHU", outDir: "voice-male" },
} as const;

const target = process.argv[2] === "male" ? "male" : "female";
const VOICE_ID: string = VOICES[target].id;
const OUT_DIR = new URL(`../public/audio/${VOICES[target].outDir}/`, import.meta.url);

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

async function generateClip(
  text: string,
  previousText: string | null,
  nextText: string | null,
  apiKey: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      // Renders this clip as if it sits mid-phrase between these two
      // neighbors instead of as its own complete sentence — see the
      // module doc comment in voiceWords.ts for why every clip now needs
      // this instead of one universal render per word.
      previous_text: previousText ?? undefined,
      next_text: nextText ?? undefined,
      model_id: "eleven_multilingual_v2",
      // stability lowered from the original 0.5 and `style`/`use_speaker_boost`
      // added on top — per ElevenLabs' own guidance, stability at 0.5+ trends
      // toward flat/monotone delivery, while a lower value plus a touch of
      // `style` (natural inflection, not caricature) reads as more fluid.
      // Unverified by ear in this environment — no speakers/audio playback
      // here, and every render costs API credits — so treat this as the best
      // documented starting point, not a confirmed final value; adjust and
      // regenerate (`npm run voice:generate`, after deleting the mp3s to
      // re-render) if it doesn't sound right once played back for real.
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status} for "${text}": ${await res.text()}`);
  }
  return res.arrayBuffer();
}

function run(cmd: string, args: string[]): { stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.error) throw res.error;
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/**
 * Trims dead air at the start/end of a freshly-generated clip in place.
 * ElevenLabs renders routinely leave 200-370ms of trailing silence per word
 * (measured directly with ffmpeg's silencedetect against this project's
 * clips) — negligible for one clip alone, but playSequence() in
 * voiceBank.ts waits for each clip's own `onended` before starting the
 * next, so that silence becomes an audible gap between every word once
 * several play back to back ("dez" ... "e" ... "vinte" instead of one
 * flowing phrase — exactly the "fala palavra por palavra" complaint this
 * was written to fix). A small fixed buffer is kept rather than trimming
 * to zero, so the cut doesn't sound abrupt.
 */
function trimSilence(path: string): void {
  const LEAD_KEEP = 0.02;
  const TRAIL_KEEP = 0.04;
  const duration = parseFloat(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]).stdout.trim(),
  );
  const { stderr } = run("ffmpeg", ["-i", path, "-af", "silencedetect=noise=-35dB:d=0.05", "-f", "null", "-"]);
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
  if (starts.length === 0) return;

  let trimStart = 0;
  let trimEnd = duration;
  if (starts[0] < 0.05) {
    trimStart = Math.max(0, (ends[0] ?? duration) - LEAD_KEEP);
  }
  const lastStart = starts[starts.length - 1];
  // A trailing silence that runs to EOF never gets its own "silence_end" line.
  const lastEnd = ends[starts.length - 1] ?? duration;
  if (lastEnd >= duration - 0.05) {
    trimEnd = Math.min(duration, lastStart + TRAIL_KEEP);
  }
  if (trimStart <= 0.001 && trimEnd >= duration - 0.001) return;

  const tmpPath = `${path}.trimmed.mp3`;
  run("ffmpeg", [
    "-y",
    "-i",
    path,
    "-ss",
    trimStart.toFixed(3),
    "-to",
    trimEnd.toFixed(3),
    "-c:a",
    "libmp3lame",
    "-q:a",
    "2",
    tmpPath,
  ]);
  renameSync(tmpPath, path);
}

/**
 * Each clip is its own ElevenLabs render, and the model doesn't hold level
 * consistent across separate calls — measured directly against this
 * project's own clips (`ffmpeg -af volumedetect`): mean loudness swings as
 * much as ~8dB between two words in the *same* voice bank (e.g. female
 * "quilômetros" at -24dB vs "cinco" in the pace slot at -32dB). Splicing
 * those back to back with no correction reads as a volume jump on top of
 * whatever "junção de blocos" the missing crossfade already causes below —
 * two separate, additive symptoms of the same root cause (each clip is an
 * independent render with no shared state).
 *
 * `loudnorm`'s LUFS measurement needs a few seconds of audio to gate on and
 * returns `-inf` on clips this short (confirmed: every single-word clip
 * here does) — so this targets mean sample volume instead, via
 * `volumedetect`, which works fine on sub-second audio. A per-clip gain
 * cap keeps the result from clipping: some words (sharper consonant
 * attacks) have a much higher peak-to-mean ratio than others, and forcing
 * their mean up to the shared target would drive their peak over 0dBFS —
 * capping means that word ends up a little quieter than the target
 * instead of distorted, which is the right tradeoff.
 */
const PEAK_CEILING_DB = -1.0;

function measureVolume(path: string): { mean: number; max: number } {
  const { stderr } = run("ffmpeg", ["-i", path, "-af", "volumedetect", "-f", "null", "-"]);
  const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  if (!meanMatch || !maxMatch) throw new Error(`could not parse volumedetect output for ${path}`);
  return { mean: parseFloat(meanMatch[1]), max: parseFloat(maxMatch[1]) };
}

function normalizeLoudness(path: string, targetMeanDb: number): void {
  const { mean, max } = measureVolume(path);
  const desiredGain = targetMeanDb - mean;
  const maxAllowedGain = PEAK_CEILING_DB - max;
  const gain = Math.min(desiredGain, maxAllowedGain);
  if (Math.abs(gain) < 0.1) return; // not worth a re-encode for a fraction of a dB

  const tmpPath = `${path}.normalized.mp3`;
  run("ffmpeg", ["-y", "-i", path, "-af", `volume=${gain.toFixed(2)}dB`, "-c:a", "libmp3lame", "-q:a", "2", tmpPath]);
  renameSync(tmpPath, path);
}

/** Picked from this project's own measured ranges (see normalizeLoudness's comment) — female clips render quieter than male ones at the same voice_settings, so each gets its own target rather than one shared number. */
const LOUDNESS_TARGET_DB: Record<"female" | "male", number> = { female: -27, male: -19 };

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // Re-levels whatever's already on disk without touching ElevenLabs at
  // all — added once normalizeLoudness existed, so the 270 clips already
  // rendered before it could be fixed without spending credits re-rendering
  // audio that was already fine content-wise, just inconsistently loud.
  if (process.argv.includes("--normalize-only")) {
    let normalized = 0;
    let checked = 0;
    for (const entry of VOICE_BANK) {
      const outPath = fileURLToPath(new URL(`${entry.slug}.mp3`, OUT_DIR));
      if (!existsSync(outPath)) continue;
      checked++;
      const before = measureVolume(outPath).mean;
      normalizeLoudness(outPath, LOUDNESS_TARGET_DB[target]);
      if (measureVolume(outPath).mean !== before) normalized++;
    }
    console.log(`done: ${normalized}/${checked} clips re-leveled for target=${target} (no ElevenLabs calls made).`);
    return;
  }

  loadEnvLocal();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY missing from .env.local");
  }

  let generated = 0;
  let skipped = 0;
  for (const entry of VOICE_BANK) {
    const outPath = new URL(`${entry.slug}.mp3`, OUT_DIR);
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }
    console.log(`generating "${entry.slug}" ("${entry.text}", prev=${entry.previousText}, next=${entry.nextText})...`);
    const audio = await generateClip(entry.text, entry.previousText, entry.nextText, apiKey);
    writeFileSync(outPath, Buffer.from(audio));
    const path = fileURLToPath(outPath);
    trimSilence(path);
    normalizeLoudness(path, LOUDNESS_TARGET_DB[target]);
    generated++;
    // ElevenLabs rate-limits aggressive back-to-back calls on lower tiers.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log(`done: ${generated} generated, ${skipped} already present (${VOICE_BANK.length} total).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
