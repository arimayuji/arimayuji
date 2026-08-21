/**
 * Pre-recorded voice announcements (Waze-style word-concatenation), playing
 * static clips from public/audio/voice/ instead of the device's built-in
 * text-to-speech. Falls back to speak() (speech.ts) whenever a value falls
 * outside the recorded 0-99 range or a clip fails to load — same idea as
 * unlockSpeech(), iOS Safari needs playback started synchronously inside a
 * user gesture the first time, so unlockVoiceBank() must be called from the
 * same click handler that starts the run.
 */
import { announcementSlugs } from "./voiceWords";
import { speak } from "./speech";

const CLIP_BASE = "/audio/voice/";
const clipCache = new Map<string, HTMLAudioElement>();

function getClip(slug: string): HTMLAudioElement {
  let el = clipCache.get(slug);
  if (!el) {
    el = new Audio(`${CLIP_BASE}${slug}.mp3`);
    el.preload = "auto";
    clipCache.set(slug, el);
  }
  return el;
}

export function isVoiceBankSupported(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

export function unlockVoiceBank(): void {
  if (!isVoiceBankSupported()) return;
  const el = getClip("e"); // shortest clip, just needs one real play() call
  el.volume = 0;
  el.play()
    .catch(() => {})
    .finally(() => {
      el.pause();
      el.currentTime = 0;
      el.volume = 1;
    });
}

let currentToken = 0;
let stopCurrentClip: (() => void) | null = null;

function stopCurrent(): void {
  stopCurrentClip?.();
  stopCurrentClip = null;
}

async function playSequence(slugs: string[], token: number): Promise<void> {
  for (const slug of slugs) {
    if (token !== currentToken) return;
    const el = getClip(slug);
    el.currentTime = 0;
    await new Promise<void>((resolve, reject) => {
      stopCurrentClip = () => {
        el.pause();
        resolve();
      };
      el.onended = () => resolve();
      el.onerror = () => reject(new Error(`voice clip failed to play: ${slug}`));
      el.play().catch(reject);
    });
  }
}

/**
 * Speaks "{km} quilômetros. Pace {min} e {sec}." from the recorded word
 * bank, falling back to text-to-speech when the value can't be spelled out
 * with recorded clips (e.g. distance past 99km) or a clip errors out.
 */
export function announceDistancePace(kmMeters: number, paceMinutes: number, paceSeconds: number): void {
  const kmTenths = (kmMeters / 1000).toFixed(1);
  const fallbackText = `${kmTenths} quilômetros. Pace ${paceMinutes} e ${paceSeconds.toString().padStart(2, "0")}.`;

  stopCurrent();
  currentToken += 1;
  const token = currentToken;

  if (!isVoiceBankSupported()) {
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

  playSequence(slugs, token).catch(() => {
    if (token === currentToken) speak(fallbackText);
  });
}
