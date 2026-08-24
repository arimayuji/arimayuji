/**
 * Pre-recorded voice announcements (Waze-style word-concatenation), playing
 * static clips from public/audio/voice/ instead of the device's built-in
 * text-to-speech. Falls back to speak() (speech.ts) whenever a value falls
 * outside the recorded 0-99 range or a clip fails to load.
 *
 * Clips are decoded and spliced sample-by-sample into one continuous
 * AudioBuffer via the Web Audio API, then played as a single
 * AudioBufferSourceNode — not chained `<audio>` elements. An early version
 * did exactly that (one `<audio>` per word, `await`ing each one's `onended`
 * before `play()`-ing the next), and even with every clip individually
 * trimmed and context-aware, it still came out "travado" — a real,
 * unavoidable startup gap every time a *separate* `HTMLMediaElement` element
 * starts playing, independent of how good the recording itself is. Splicing
 * into one buffer and playing it as a single unit has no element boundary
 * left to gap on.
 *
 * `unlockVoiceBank()` must still be called synchronously inside the same
 * user gesture that starts the run — iOS Safari suspends a fresh
 * AudioContext until it's resumed from within a gesture handler, same
 * constraint `unlockSpeech()` documents for speech synthesis.
 */
import { announcementSlugs } from "./voiceWords";
import { speak } from "./speech";

export type VoiceGender = "female" | "male";

/** Matches `outDir` per voice in scripts/generate-voice-bank.ts's VOICES map — "female" (the original "Bianca" bank) keeps the original path so already-generated clips don't need moving. */
const CLIP_BASE: Record<VoiceGender, string> = {
  female: "/audio/voice/",
  male: "/audio/voice-male/",
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioContext ??= new Ctor();
  return audioContext;
}

// Keyed by "gender/slug" — the same slug means a different clip per voice, so
// a plain slug key would let a female clip served earlier this session
// answer a lookup for the male bank (or vice versa) after the athlete
// switches voices between runs.
const bufferCache = new Map<string, Promise<AudioBuffer>>();

async function loadBuffer(slug: string, gender: VoiceGender, ctx: AudioContext): Promise<AudioBuffer> {
  const cacheKey = `${gender}/${slug}`;
  let pending = bufferCache.get(cacheKey);
  if (!pending) {
    pending = fetch(`${CLIP_BASE[gender]}${slug}.mp3`)
      .then((res) => {
        if (!res.ok) throw new Error(`voice clip ${slug} (${gender}) responded ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    bufferCache.set(cacheKey, pending);
  }
  try {
    return await pending;
  } catch (err) {
    bufferCache.delete(cacheKey); // don't let one bad fetch/decode poison every retry
    throw err;
  }
}

/**
 * Splices a sequence of already-decoded clips into one buffer, sample by
 * sample — `decodeAudioData` resamples every clip to the AudioContext's own
 * sample rate on the way in, so they're always compatible here regardless of
 * the source file's original rate.
 */
function concatBuffers(buffers: AudioBuffer[], ctx: AudioContext): AudioBuffer {
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = ctx.createBuffer(channels, totalLength, ctx.sampleRate);
  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < channels; ch++) {
      // Mono clip feeding a stereo (or wider) output: reuse channel 0 for
      // every output channel rather than leaving the extra ones silent.
      const source = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
      out.getChannelData(ch).set(source, offset);
    }
    offset += buf.length;
  }
  return out;
}

export function isVoiceBankSupported(): boolean {
  return getAudioContext() !== null;
}

export function unlockVoiceBank(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
}

let currentSource: AudioBufferSourceNode | null = null;
// Guards the gap between "announcement requested" and "buffers finished
// decoding" — without this, an announcement whose fetch/decode is still in
// flight when a newer one arrives would start playing *after* it (nothing
// to `stopCurrent()` yet, since it never got as far as creating a source
// node), talking over or after the announcement that was supposed to win.
let currentToken = 0;

function stopCurrent(): void {
  currentToken += 1;
  if (!currentSource) return;
  // `stop()` fires `onended` synchronously in some engines — clear the
  // reference first so that handler doesn't see (and try to stop again) the
  // node it's currently stopping.
  const node = currentSource;
  currentSource = null;
  try {
    node.stop();
  } catch {
    // Already stopped/finished — nothing to do.
  }
}

async function playSpliced(slugs: string[], gender: VoiceGender, ctx: AudioContext, token: number): Promise<void> {
  const buffers = await Promise.all(slugs.map((slug) => loadBuffer(slug, gender, ctx)));
  if (token !== currentToken) return; // superseded while buffers were loading
  const spliced = concatBuffers(buffers, ctx);

  const source = ctx.createBufferSource();
  source.buffer = spliced;
  source.connect(ctx.destination);
  currentSource = source;
  source.start();
}

/**
 * Speaks "{km} quilômetros. Pace {min} e {sec}." from the recorded word
 * bank, falling back to text-to-speech when the value can't be spelled out
 * with recorded clips (e.g. distance past 99km) or a clip fails to fetch/decode.
 */
export function announceDistancePace(
  kmMeters: number,
  paceMinutes: number,
  paceSeconds: number,
  gender: VoiceGender = "female",
): void {
  const kmTenths = (kmMeters / 1000).toFixed(1);
  const fallbackText = `${kmTenths} quilômetros. Pace ${paceMinutes} e ${paceSeconds.toString().padStart(2, "0")}.`;

  stopCurrent();
  const token = currentToken;

  const ctx = getAudioContext();
  if (!ctx) {
    speak(fallbackText);
    return;
  }

  let slugs: string[];
  try {
    slugs = announcementSlugs(kmTenths, paceMinutes, paceSeconds);
  } catch {
    speak(fallbackText);
    return;
  }

  playSpliced(slugs, gender, ctx, token).catch(() => {
    if (token === currentToken) speak(fallbackText);
  });
}
