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
  window.speechSynthesis.cancel(); // don't queue stale announcements behind a new one
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}
