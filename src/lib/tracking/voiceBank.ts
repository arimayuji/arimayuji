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
 * Splices a sequence of already-decoded clips into one buffer — `decodeAudioData`
 * resamples every clip to the AudioContext's own sample rate on the way in, so
 * they're always compatible here regardless of the source file's original rate.
 *
 * A short linear crossfade at each splice, rather than a hard sample-accurate
 * cut, softens the residual level jump between clips (each clip is an
 * independent ElevenLabs render — measured up to ~8dB apart even after
 * generate-voice-bank.ts's own loudness normalization pass, since a per-clip
 * gain cap keeps sharper-attack words from clipping instead of matching them
 * exactly). This can't fix pitch-contour discontinuity between separately
 * rendered clips — no shared acoustic state exists to blend — but it removes
 * the click/level-jump a bare concat leaves at every boundary.
 */
const CROSSFADE_SECONDS = 0.015;

/**
 * generate-voice-bank.ts's `trimSilence()` deliberately leaves a small fixed
 * pad after each word (TRAIL_KEEP, 40ms) rather than cutting to zero, so a
 * lone clip never sounds abruptly chopped. Once several clips are spliced
 * back to back, though, that pad is 25ms wider than the crossfade above
 * actually needs — a real, audible sliver of the "word by word" feel this
 * whole file exists to remove. This shaves that extra sliver off every
 * *non-final* buffer's tail before splicing (the last clip in a phrase has
 * nothing after it to gap against, so its own trailing pad is left alone).
 *
 * This has to happen here, on decoded PCM, rather than by re-trimming the
 * source mp3 tighter: confirmed by testing that re-encoding a clip with a
 * few ms shaved off the end left several clips' reported duration
 * completely unchanged — mp3 only stores whole ~26ms frames, so a cut
 * smaller than one frame is silently absorbed by frame padding at the
 * codec level. Trimming the already-decoded Float32 samples has no such
 * floor.
 */
const EXTRA_TAIL_TRIM_SECONDS = 0.015;

/** How many samples of `buf` to actually use, given its position in the sequence. */
function effectiveLength(buf: AudioBuffer, isLast: boolean, ctx: AudioContext): number {
  if (isLast) return buf.length;
  const trim = Math.round(EXTRA_TAIL_TRIM_SECONDS * ctx.sampleRate);
  // Never trim more than a third off a very short clip — a floor against
  // eating into real speech on the bank's shortest entries (~130ms), not
  // something expected to bind on ordinary word-length clips.
  return Math.max(buf.length - trim, Math.ceil(buf.length * (2 / 3)));
}

function concatBuffers(buffers: AudioBuffer[], ctx: AudioContext): AudioBuffer {
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const crossfadeSamples = Math.round(CROSSFADE_SECONDS * ctx.sampleRate);
  const lengths = buffers.map((buf, i) => effectiveLength(buf, i === buffers.length - 1, ctx));
  // Capped by both neighbors' own (possibly now-trimmed) length so a crossfade never outlasts the shorter clip.
  const overlaps = lengths.slice(0, -1).map((len, i) => Math.min(crossfadeSamples, len, lengths[i + 1]));

  const totalLength = lengths.reduce((sum, len) => sum + len, 0) - overlaps.reduce((sum, o) => sum + o, 0);
  const out = ctx.createBuffer(channels, totalLength, ctx.sampleRate);

  let offset = 0;
  buffers.forEach((buf, i) => {
    const len = lengths[i];
    const fadeIn = i === 0 ? 0 : overlaps[i - 1];
    const fadeOut = i === buffers.length - 1 ? 0 : overlaps[i];
    for (let ch = 0; ch < channels; ch++) {
      // Mono clip feeding a stereo (or wider) output: reuse channel 0 for
      // every output channel rather than leaving the extra ones silent.
      const source = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
      const outData = out.getChannelData(ch);
      for (let s = 0; s < len; s++) {
        let gain = 1;
        if (s < fadeIn) gain = (s + 1) / (fadeIn + 1);
        else if (s >= len - fadeOut) gain = (len - s) / (fadeOut + 1);
        // `+=`, not `=`: the leading fade-in region overlaps positions the
        // previous clip's trailing fade-out already wrote — this is what
        // actually blends the two instead of one silently overwriting the other.
        outData[offset + s] += source[s] * gain;
      }
    }
    offset += len - fadeOut;
  });
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

const CARB_GEL_REMINDER_SLUG = "carb-gel-reminder";
const CARB_GEL_REMINDER_FALLBACK_TEXT = "Hora de tomar seu gel de carboidrato.";

/**
 * Speaks the fixed carb-gel reminder phrase — unlike `announceDistancePace`,
 * this is a single whole-sentence clip, never assembled from parts, so it
 * skips `concatBuffers` entirely and just plays the one buffer directly.
 */
export function announceCarbGelReminder(gender: VoiceGender = "female"): void {
  stopCurrent();
  const token = currentToken;

  const ctx = getAudioContext();
  if (!ctx) {
    speak(CARB_GEL_REMINDER_FALLBACK_TEXT);
    return;
  }

  loadBuffer(CARB_GEL_REMINDER_SLUG, gender, ctx)
    .then((buffer) => {
      if (token !== currentToken) return; // superseded while the clip was loading
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      currentSource = source;
      source.start();
    })
    .catch(() => {
      if (token === currentToken) speak(CARB_GEL_REMINDER_FALLBACK_TEXT);
    });
}
