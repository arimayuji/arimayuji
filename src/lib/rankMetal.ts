/**
 * A single rarity-metal ladder shared by all three lifetime-collectible
 * ladders (distância/elevação/tempo — see collectibles.ts and emblems.ts).
 * Each of the three has exactly eleven rungs, so "rank" (1st through 11th
 * milestone crossed) is what ties an emblem's colour to how rare it is,
 * instead of the old per-milestone hand-picked hex that had no relationship
 * to the others. Ascends metal-then-gem the way rank ladders in games like
 * Rainbow Six Siege do (copper/bronze/silver/gold/platinum before the gem
 * tiers), ending on a one-of-a-kind tone for the single rarest rung.
 */
export interface RankMetal {
  name: string;
  accent: string;
}

export const RANK_METAL: readonly RankMetal[] = [
  { name: "Cobre", accent: "#c9825a" },
  { name: "Bronze", accent: "#c9772f" },
  { name: "Prata", accent: "#c6d3e2" },
  { name: "Ouro", accent: "#f0b429" },
  { name: "Platina", accent: "#d9c9f5" },
  { name: "Safira", accent: "#3f7fe0" },
  { name: "Esmeralda", accent: "#2ecc82" },
  { name: "Rubi", accent: "#e0304f" },
  { name: "Ametista", accent: "#9b5de5" },
  { name: "Diamante", accent: "#8fe8ff" },
  { name: "Prisma", accent: "#ff6ec7" },
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
