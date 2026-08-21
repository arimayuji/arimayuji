/**
 * Portuguese number-word grammar for the pre-recorded voice announcement
 * bank (see scripts/generate-voice-bank.ts and voiceBank.ts). Isomorphic —
 * no DOM/Node APIs — so both the generation script and the browser
 * playback engine import the same source of truth for which clips exist
 * and how a number decomposes into them.
 *
 * 0-20 are irregular standalone words; 21-99 follow "dezena + e + unidade",
 * reusing the same unit words 1-9 already recorded for the standalone case.
 */

const UNITS = ["zero", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove"];

const TEENS: Record<number, string> = {
  10: "dez",
  11: "onze",
  12: "doze",
  13: "treze",
  14: "quatorze",
  15: "quinze",
  16: "dezesseis",
  17: "dezessete",
  18: "dezoito",
  19: "dezenove",
  20: "vinte",
};

const TENS: Record<number, string> = {
  30: "trinta",
  40: "quarenta",
  50: "cinquenta",
  60: "sessenta",
  70: "setenta",
  80: "oitenta",
  90: "noventa",
};

/** slug -> what to speak when generating that clip. */
export const WORD_BANK: Record<string, string> = {
  ...Object.fromEntries(UNITS.map((slug) => [slug, slug === "tres" ? "três" : slug])),
  ...Object.fromEntries(Object.values(TEENS).map((slug) => [slug, slug])),
  ...Object.fromEntries(Object.values(TENS).map((slug) => [slug, slug])),
  e: "e",
  virgula: "vírgula",
  quilometros: "quilômetros",
  pace: "pace",
};

export const VOICE_BANK_SLUGS = Object.keys(WORD_BANK);

/** Decomposes an integer 0-99 into the ordered clip slugs that speak it. */
export function numberToSlugs(n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw new RangeError(`numberToSlugs: ${n} is outside the recorded 0-99 range`);
  }
  if (n <= 9) return [UNITS[n]];
  if (n <= 20) return [TEENS[n]];
  const tens = Math.floor(n / 10) * 10;
  const units = n % 10;
  const tensSlug = TENS[tens];
  return units === 0 ? [tensSlug] : [tensSlug, "e", UNITS[units]];
}

/** Slug sequence for "{km.toFixed(1)} quilômetros. Pace {min} e {sec}." */
export function announcementSlugs(kmTenths: string, paceMinutes: number, paceSeconds: number): string[] {
  const [intPart, decPart] = kmTenths.split(".");
  return [
    ...numberToSlugs(Number(intPart)),
    "virgula",
    ...numberToSlugs(Number(decPart ?? "0")),
    "quilometros",
    "pace",
    ...numberToSlugs(paceMinutes),
    "e",
    ...numberToSlugs(paceSeconds),
  ];
}
