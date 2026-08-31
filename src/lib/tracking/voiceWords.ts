/**
 * Portuguese number-word grammar for the pre-recorded voice announcement
 * bank (see scripts/generate-voice-bank.ts and voiceBank.ts). Isomorphic —
 * no DOM/Node APIs — so both the generation script and the browser
 * playback engine import the same source of truth for which clips exist
 * and how a number decomposes into them.
 *
 * 0-20 are irregular standalone words; 21-99 follow "dezena + e + unidade",
 * reusing the same unit words 1-9 already recorded for the standalone case.
 *
 * Every announcement follows one fixed shape:
 *   [km inteiro] "vírgula" [km decimal] "quilômetros ritmo" [minutos] "e" [segundos]
 * ("quilômetros ritmo" is recorded as one continuous clip, not two spliced
 * ones — the only pair in the template that's always adjacent with no
 * variable number between them, so it's the one seam that can be removed
 * outright instead of just smoothed by crossfade/silence-trim.)
 * A first pass at this bank recorded one clip per word with no idea what
 * would play before/after it — each clip came out of ElevenLabs with its
 * own complete start-to-finish sentence intonation, so playing several back
 * to back read as separate sentences glued together ("dez." "e." "vinte."),
 * not one flowing phrase. This version instead records each word once per
 * *context* it can appear in — same word, but rendered with the actual
 * neighboring text as `previous_text`/`next_text` hints — so the model
 * shapes it as genuinely mid-phrase.
 *
 * All 135 clips this bank needs have been generated (two ElevenLabs quota
 * top-ups across the build). Even with every clip individually
 * context-aware, this still needs a gap-free playback engine to actually
 * read as one flowing phrase — see voiceBank.ts's buffer-splicing comment
 * for the other half of that fix.
 *
 * A word's exact position in the template (which of the 4 numeric slots,
 * and whether it's spoken alone or as the tens/units half of a compound
 * like "vinte e cinco") determines its literal previous/next neighbor.
 * Enumerating every (slot, standalone/tens/units) combination turns up
 * only 7 distinct (previousText, nextText) pairs in total — several
 * combinations sit between literally the same two neighbor words (e.g. a
 * lone minutes value and the tens-half of a compound minutes value both
 * sit right after "ritmo" and right before the "e" that leads into
 * seconds), so recording them separately would just be the same audio
 * twice. See ROLE_CONTEXT below for the 7.
 */

export type NumberSlot = "kmInt" | "kmDec" | "min" | "sec";

export type NumberRole =
  | "leadNumber" // start of the phrase, before "vírgula" — a lone km-inteiro value
  | "leadTensPart" // start of the phrase, before the internal "e" — tens-half of a compound km-inteiro
  | "kmUnitsPart" // after the internal "e", before "vírgula" — units-half of a compound km-inteiro
  | "kmDecimal" // after "vírgula", before "quilômetros ritmo" — the single km-decimal digit
  | "paceLead" // after "ritmo", before "e" — a lone minutes value, or the tens-half of a compound one
  | "midConnector" // after "e", before "e" — units-half of compound minutes, or tens-half of compound seconds
  | "trailNumber"; // after "e", at the end of the phrase — a lone seconds value, or units-half of a compound one

const ROLE_CONTEXT: Record<NumberRole, { previousText: string | null; nextText: string | null }> = {
  leadNumber: { previousText: null, nextText: "vírgula" },
  leadTensPart: { previousText: null, nextText: "e" },
  kmUnitsPart: { previousText: "e", nextText: "vírgula" },
  kmDecimal: { previousText: "vírgula", nextText: "quilômetros" },
  paceLead: { previousText: "ritmo", nextText: "e" },
  midConnector: { previousText: "e", nextText: "e" },
  trailNumber: { previousText: "e", nextText: null },
};

/** Every role a word spoken standalone (never split into tens+units) can take, by slot. */
const STANDALONE_ROLE_BY_SLOT: Record<NumberSlot, NumberRole> = {
  kmInt: "leadNumber",
  kmDec: "kmDecimal",
  min: "paceLead",
  sec: "trailNumber",
};

/** Role for the tens-half of a compound number (e.g. "vinte" in "vinte e cinco"), by slot. kmDec never compounds (always a single digit). */
const TENS_PART_ROLE_BY_SLOT: Partial<Record<NumberSlot, NumberRole>> = {
  kmInt: "leadTensPart",
  min: "paceLead", // sits right after "ritmo", right before the internal "e" — same neighbors as a lone minutes value
  sec: "midConnector",
};

/** Role for the units-half of a compound number, by slot. kmDec never compounds. */
const UNITS_PART_ROLE_BY_SLOT: Partial<Record<NumberSlot, NumberRole>> = {
  kmInt: "kmUnitsPart",
  min: "midConnector",
  sec: "trailNumber", // sits right after the internal "e", at the very end — same neighbors as a lone seconds value
};

const UNITS_TEXT = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const UNITS_SLUG = ["zero", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove"];

const TEENS_TEXT: Record<number, string> = {
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
};

const TENS_TEXT: Record<number, string> = {
  20: "vinte",
  30: "trinta",
  40: "quarenta",
  50: "cinquenta",
  60: "sessenta",
  70: "setenta",
  80: "oitenta",
  90: "noventa",
};

function slugFor(base: string, role: NumberRole): string {
  return `${base}--${role}`;
}

/** Decomposes an integer 0-99, spoken in the given template slot, into the ordered clip slugs that speak it. */
export function numberToSlugs(n: number, slot: NumberSlot): string[] {
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw new RangeError(`numberToSlugs: ${n} is outside the recorded 0-99 range`);
  }
  if (n <= 9) {
    return [slugFor(UNITS_SLUG[n], STANDALONE_ROLE_BY_SLOT[slot])];
  }
  if (n <= 20) {
    // 20 ("vinte") is standalone here — the 21-99 branch below handles it as a tens-part instead.
    return [slugFor(n === 20 ? "vinte" : TEENS_TEXT[n], STANDALONE_ROLE_BY_SLOT[slot])];
  }
  const tens = Math.floor(n / 10) * 10;
  const units = n % 10;
  const tensBase = TENS_TEXT[tens];
  if (units === 0) {
    return [slugFor(tensBase, STANDALONE_ROLE_BY_SLOT[slot])];
  }
  const tensRole = TENS_PART_ROLE_BY_SLOT[slot];
  const unitsRole = UNITS_PART_ROLE_BY_SLOT[slot];
  if (!tensRole || !unitsRole) {
    throw new RangeError(`numberToSlugs: slot "${slot}" cannot hold a compound value (${n})`);
  }
  return [slugFor(tensBase, tensRole), "e--internal", slugFor(UNITS_SLUG[units], unitsRole)];
}

/** Slug sequence for "{km.toFixed(1)} quilômetros. Ritmo {min} e {sec}." */
export function announcementSlugs(kmTenths: string, paceMinutes: number, paceSeconds: number): string[] {
  const [intPart, decPart] = kmTenths.split(".");
  return [
    ...numberToSlugs(Number(intPart), "kmInt"),
    "virgula",
    ...numberToSlugs(Number(decPart ?? "0"), "kmDec"),
    "quilometros-ritmo",
    ...numberToSlugs(paceMinutes, "min"),
    "e--paceConnector",
    ...numberToSlugs(paceSeconds, "sec"),
  ];
}

export interface VoiceBankEntry {
  slug: string;
  text: string;
  previousText: string | null;
  nextText: string | null;
}

/**
 * Every clip the generation script needs to render, and (via WORD_BANK
 * below) what each one plays back. A word that can appear in N distinct
 * roles gets N separate entries — same spoken text, different recorded
 * context — rather than N slugs pointing at one shared clip.
 */
function buildVoiceBank(): VoiceBankEntry[] {
  const entries: VoiceBankEntry[] = [];

  const addStandaloneOnly = (base: string, text: string, slots: NumberSlot[]) => {
    for (const slot of slots) {
      const role = STANDALONE_ROLE_BY_SLOT[slot];
      entries.push({ slug: slugFor(base, role), text, ...ROLE_CONTEXT[role] });
    }
  };

  const addTensCapable = (base: string, text: string) => {
    for (const slot of ["kmInt", "min", "sec"] as const) {
      const standaloneRole = STANDALONE_ROLE_BY_SLOT[slot];
      entries.push({ slug: slugFor(base, standaloneRole), text, ...ROLE_CONTEXT[standaloneRole] });
      const tensRole = TENS_PART_ROLE_BY_SLOT[slot];
      if (tensRole && tensRole !== standaloneRole) {
        entries.push({ slug: slugFor(base, tensRole), text, ...ROLE_CONTEXT[tensRole] });
      }
    }
  };

  // Units words (0-9): every slot, standalone form only for kmDec, plus
  // the units-half-of-a-compound role for the other three slots.
  for (let n = 0; n <= 9; n++) {
    const base = UNITS_SLUG[n];
    const text = UNITS_TEXT[n];
    addStandaloneOnly(base, text, ["kmDec"]);
    for (const slot of ["kmInt", "min", "sec"] as const) {
      const standaloneRole = STANDALONE_ROLE_BY_SLOT[slot];
      entries.push({ slug: slugFor(base, standaloneRole), text, ...ROLE_CONTEXT[standaloneRole] });
      const unitsRole = UNITS_PART_ROLE_BY_SLOT[slot];
      if (unitsRole && unitsRole !== standaloneRole) {
        entries.push({ slug: slugFor(base, unitsRole), text, ...ROLE_CONTEXT[unitsRole] });
      }
    }
  }

  // Teens 10-19 (never compound, never in kmDec — that slot is always a single digit).
  for (let n = 10; n <= 19; n++) {
    addStandaloneOnly(TEENS_TEXT[n], TEENS_TEXT[n], ["kmInt", "min", "sec"]);
  }

  // "vinte" and the tens 30-90 (can stand alone, or lead a compound).
  for (const text of Object.values(TENS_TEXT)) {
    addTensCapable(text, text);
  }

  // Connectors. "e" needs two renders — the internal tens/units joiner
  // inside a single number, and the top-level minutes-to-seconds
  // connector — since those sit in genuinely different phrase positions.
  // "vírgula" only ever sits in one template position, so one recording
  // (with a representative neighbor, since the actual adjacent number
  // varies by run) covers every use.
  entries.push({ slug: "e--internal", text: "e", previousText: "vinte", nextText: "cinco" });
  entries.push({ slug: "e--paceConnector", text: "e", previousText: "dez", nextText: "trinta" });
  entries.push({ slug: "virgula", text: "vírgula", previousText: "cinco", nextText: "cinco" });
  // "quilômetros" and "ritmo" are the one pair in the whole template that's
  // ALWAYS adjacent with no variable number between them (every other
  // fixed word has a number on at least one side) — recorded as a single
  // continuous phrase instead of two separately-spliced clips, so this is
  // the one seam in the announcement that's genuinely eliminated rather
  // than just smoothed by crossfade/silence-trim. Slug keeps "ritmo" out
  // of its name only in spirit; "pace" never appears here since this is a
  // new clip, not the old one being renamed.
  entries.push({ slug: "quilometros-ritmo", text: "quilômetros ritmo", previousText: "cinco", nextText: "dez" });

  // Carb-gel reminder — a whole standalone sentence, not a word in the
  // numeric template above, so it has no previous/next neighbor at all:
  // voiceBank.ts's `announceCarbGelReminder` plays this one clip directly,
  // it's never spliced with anything else.
  entries.push({
    slug: "carb-gel-reminder",
    text: "Hora de tomar seu gel de carboidrato.",
    previousText: null,
    nextText: null,
  });

  // "Coach ao vivo" cues — same standalone-sentence shape as the carb-gel
  // reminder above (voiceBank.ts's `announceCoachCue` plays one of these
  // three directly, never spliced). The coach only ever picks one of these
  // fixed phrases, never free text — see liveRuns.ts's `CoachCueId`.
  entries.push({
    slug: "coach-cue-reduce-pace",
    text: "Seu treinador está pedindo pra você reduzir o ritmo.",
    previousText: null,
    nextText: null,
  });
  entries.push({
    slug: "coach-cue-increase-pace",
    text: "Seu treinador quer que você acelere.",
    previousText: null,
    nextText: null,
  });
  entries.push({
    slug: "coach-cue-stop",
    text: "Seu treinador está pedindo pra você parar.",
    previousText: null,
    nextText: null,
  });

  // Interval-training phase cues — same standalone-sentence shape as the
  // carb-gel reminder/coach cues above (voiceBank.ts's `announceIntervalPhase`
  // plays one of these three directly, never spliced). Fixed vocabulary,
  // never per-workout free text, unlike aquecimento/page.tsx's exercise-name
  // announcements.
  entries.push({ slug: "interval-work", text: "Vai!", previousText: null, nextText: null });
  entries.push({ slug: "interval-rest", text: "Descanso.", previousText: null, nextText: null });
  entries.push({
    slug: "interval-done",
    text: "Treino de intervalos completo.",
    previousText: null,
    nextText: null,
  });

  return entries;
}

export const VOICE_BANK: VoiceBankEntry[] = buildVoiceBank();

/** slug -> text to speak, for generate-voice-bank.ts. */
export const WORD_BANK: Record<string, string> = Object.fromEntries(VOICE_BANK.map((e) => [e.slug, e.text]));

export const VOICE_BANK_SLUGS: string[] = VOICE_BANK.map((e) => e.slug);
