import type { TierPaint } from "./plateMetal";

/**
 * A single rarity-metal ladder shared by all three lifetime-collectible
 * ladders (distância/elevação/tempo — see collectibles.ts and emblems.ts).
 * Each of the three has exactly eleven rungs, so "rank" (1st through 11th
 * milestone crossed) is what ties an emblem's colour to how rare it is,
 * instead of the old per-milestone hand-picked hex that had no relationship
 * to the others. Ascends metal-then-gem the way rank ladders in games like
 * Rainbow Six Siege do (copper/bronze/silver/gold/platinum before the gem
 * tiers), ending on a pair of iridescent, hue-shifting tones for the two
 * rarest rungs — same trick `TIER_PAINT`'s diamante/platina already use.
 *
 * Every entry is itself a `TierPaint` (see plateMetal.ts) so emblem-badge.tsx
 * can render the *same* faceted-chrome face and engraved horse the PR
 * achievement plate does — a flat `mix-blend-mode` tint over the coin
 * photo read as a plain coloured circle, not a precious object; the plate's
 * hard-edged light/dark ramp is what actually sells "metal" or "gem".
 */
export interface RankMetal extends TierPaint {
  name: string;
  /** Flat representative colour — reveal-screen ambient chrome (wash, ring, sparkles, heading) and the elevação/tempo glyph stroke, everywhere a single flat hex is enough rather than the full ramp. */
  accent: string;
}

export const RANK_METAL: readonly RankMetal[] = [
  { name: "Cobre", accent: "#c9825a", hue: 22, hue2: 150, sat: 0.52, tint: 0.68, glow: "#c9825a", glowOnLight: "#8a5230", ink: "#2a170a" },
  { name: "Bronze", accent: "#c9772f", hue: 21, hue2: 355, sat: 0.54, tint: 0.72, glow: "#c9772f", glowOnLight: "#8a4a15", ink: "#2a170a" },
  { name: "Prata", accent: "#c6d3e2", hue: 212, hue2: 212, sat: 0.09, tint: 0.32, glow: "#c6d3e2", glowOnLight: "#46505c", ink: "#12171d" },
  { name: "Ouro", accent: "#f0b429", hue: 43, hue2: 350, sat: 0.74, tint: 0.78, glow: "#f0b429", glowOnLight: "#8a6207", ink: "#2a1f04" },
  { name: "Platina", accent: "#d9c9f5", hue: 275, hue2: 185, sat: 0.3, tint: 0.4, glow: "#d9c9f5", glowOnLight: "#5f4a8a", ink: "#1c1428" },
  { name: "Safira", accent: "#3f7fe0", hue: 214, hue2: 255, sat: 0.68, tint: 0.72, glow: "#5b96f0", glowOnLight: "#1c4fa8", ink: "#071322" },
  { name: "Esmeralda", accent: "#2ecc82", hue: 152, hue2: 178, sat: 0.55, tint: 0.72, glow: "#4fe0a0", glowOnLight: "#0f7a4c", ink: "#06180f" },
  { name: "Rubi", accent: "#e0304f", hue: 350, hue2: 15, sat: 0.62, tint: 0.75, glow: "#ff5570", glowOnLight: "#a01838", ink: "#240509" },
  { name: "Ametista", accent: "#9b5de5", hue: 280, hue2: 250, sat: 0.48, tint: 0.72, glow: "#b57bf0", glowOnLight: "#6a2fb0", ink: "#180a26" },
  { name: "Diamante", accent: "#8fe8ff", hue: 186, hue2: 205, sat: 0.55, tint: 0.5, glow: "#68e2ff", glowOnLight: "#0e6a83", ink: "#052029" },
  { name: "Prisma", accent: "#ff6ec7", hue: 320, hue2: 40, sat: 0.6, tint: 0.62, glow: "#ff8ed0", glowOnLight: "#a8267c", ink: "#240418" },
];

/** Clamped to the ladder's own ends — a rank of 0 or beyond 11 shouldn't ever happen, but a bad lookup should still render something instead of `undefined.accent`. */
export function metalForRank(rank: number): RankMetal {
  const index = Math.min(RANK_METAL.length, Math.max(1, rank)) - 1;
  return RANK_METAL[index];
}

/** `rank` is just "how many rungs of this ladder are at or below `value`" — the same computation collectibleDisplay already does per category, exposed here so any other caller (e.g. the finish-screen milestone banner) doesn't need its own copy. */
export function metalForMilestone(ladder: readonly number[], value: number): RankMetal {
  return metalForRank(ladder.indexOf(value) + 1);
}
