/**
 * Voice pace announcements.
 *
 * iOS Safari mutes SpeechSynthesis unless it has been "unlocked" by a
 * speak() call made synchronously inside a user gesture. Call
 * unlockSpeech() from the same click handler that starts the run.
 */

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function unlockSpeech(): void {
  if (!isSpeechSupported()) return;
  const utterance = new SpeechSynthesisUtterance("");
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}

export function speak(text: string, lang = "pt-BR"): void {
  if (!isSpeechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel(); // don't queue stale announcements behind a new one
  // Chrome on Android is known to leave the synthesizer in a paused state
  // after the tab loses and regains focus (locking the screen mid-run does
  // this) — cancel() alone doesn't clear that, so an announcement can go
  // out completely silent with no error to catch. resume() is a no-op when
  // nothing is paused, so it's safe to call unconditionally here.
  synth.resume();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1;
  synth.speak(utterance);
}
