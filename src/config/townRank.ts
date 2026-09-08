/**
 * Phase 83: Town Rank Ladder. A thin, derived-label system giving the player
 * one legible long-arc progress number - deliberately NOT a full milestone
 * system (Phase 81's procedural objectives already own moment-to-moment
 * goal-setting). Pure derivation module, no gameState import, matching
 * objectives.ts/resourceGraph.ts's shape: gameState.ts builds a
 * TownRankSnapshot from values it already tracks (computeNetWorth().total,
 * getDayNumber(), totalPopulation, getCompletedObjectiveCount()) and this
 * file only ever reads that snapshot.
 *
 * This is the direct dependency for Phase 84 (Prestige), which will use the
 * rank as its currency basis - the snapshot shape and threshold values are
 * picked to still make sense as a formula input later (see the module doc
 * below), even though the prestige formula itself is explicitly out of scope
 * here.
 */

export type TownRank = 'camp' | 'hamlet' | 'village' | 'town' | 'boomtown' | 'city';

/** Deliberately in ladder order - every ranked list/iteration in this module and its callers relies on this order, not on numeric rank values. */
export const TOWN_RANK_ORDER: readonly TownRank[] = ['camp', 'hamlet', 'village', 'town', 'boomtown', 'city'];

export const TOWN_RANK_LABELS: Record<TownRank, string> = {
  camp: 'Camp',
  hamlet: 'Hamlet',
  village: 'Village',
  town: 'Town',
  boomtown: 'Boomtown',
  city: 'City',
};

export interface TownRankSnapshot {
  /** computeNetWorth().total - cash + banked + resource stock + standing building value. */
  netWorth: number;
  /** getDayNumber() - 1-indexed day count, keeps climbing forever in Endless mode. */
  daysSurvived: number;
  /** Live totalPopulation (sum of every standing House's tiered population grant). */
  totalPopulation: number;
  /** getCompletedObjectiveCount() - lifetime completed objectives, never decrements. */
  completedObjectives: number;
}

/**
 * Per-rank requirement: ALL four thresholds must be met (an AND, not a
 * weighted composite score) to hold the rank. An AND was chosen over a
 * blended score because a rank is meant to read as "the town has genuinely
 * grown on every axis" - a composite score lets a single maxed-out stat
 * (e.g. a huge net worth from hoarding cash while population stays at 2)
 * paper over the others, which would make the label lie about what the town
 * actually looks like. Each threshold field is optional so a low-tier rank
 * can leave an axis ungated (Camp requires nothing at all - every fresh game
 * starts there); `getRankForSnapshot` walks the ladder from the top down and
 * returns the first (highest) rank whose every declared threshold is met.
 *
 * Growth curve: each field's threshold is roughly 2.2-2.6x the previous
 * rank's, a multiplicative curve rather than linear, so each rank takes
 * meaningfully longer to reach than the last - this matters for a long
 * Endless run (the default mode, no difficulty plateau) where a linear curve
 * would make City reachable in the same rough multiple-of-time as Hamlet,
 * flattening the sense of progress the ladder exists to provide. Net worth
 * and days are the two fastest-moving/most game-length-correlated stats,
 * so they carry the steepest multiplier; population and objectives are
 * slower/more effort-gated (a House needs real tax/goods to reach Tier 3,
 * an objective needs an entire quest completed), so their curve is gentler -
 * requiring all four keeps a rank from being reachable by grinding just one
 * easy axis.
 */
export interface TownRankRequirement {
  netWorthAtLeast?: number;
  daysSurvivedAtLeast?: number;
  totalPopulationAtLeast?: number;
  completedObjectivesAtLeast?: number;
}

export const TOWN_RANK_THRESHOLDS: Record<TownRank, TownRankRequirement> = {
  camp: {},
  hamlet: {
    netWorthAtLeast: 3000,
    daysSurvivedAtLeast: 2,
    totalPopulationAtLeast: 8,
    completedObjectivesAtLeast: 2,
  },
  village: {
    netWorthAtLeast: 7000,
    daysSurvivedAtLeast: 4,
    totalPopulationAtLeast: 16,
    completedObjectivesAtLeast: 5,
  },
  town: {
    netWorthAtLeast: 16000,
    daysSurvivedAtLeast: 8,
    totalPopulationAtLeast: 28,
    completedObjectivesAtLeast: 10,
  },
  boomtown: {
    netWorthAtLeast: 38000,
    daysSurvivedAtLeast: 15,
    totalPopulationAtLeast: 44,
    completedObjectivesAtLeast: 18,
  },
  city: {
    netWorthAtLeast: 90000,
    daysSurvivedAtLeast: 26,
    totalPopulationAtLeast: 64,
    completedObjectivesAtLeast: 30,
  },
};

function meetsRequirement(snapshot: TownRankSnapshot, requirement: TownRankRequirement): boolean {
  if (requirement.netWorthAtLeast !== undefined && snapshot.netWorth < requirement.netWorthAtLeast) {
    return false;
  }
  if (requirement.daysSurvivedAtLeast !== undefined && snapshot.daysSurvived < requirement.daysSurvivedAtLeast) {
    return false;
  }
  if (
    requirement.totalPopulationAtLeast !== undefined &&
    snapshot.totalPopulation < requirement.totalPopulationAtLeast
  ) {
    return false;
  }
  if (
    requirement.completedObjectivesAtLeast !== undefined &&
    snapshot.completedObjectives < requirement.completedObjectivesAtLeast
  ) {
    return false;
  }
  return true;
}

/** Returns the highest rank whose requirements are all met, walking the ladder top-down. Camp (empty requirement) always matches, so this never fails to return a value. */
export function getRankForSnapshot(snapshot: TownRankSnapshot): TownRank {
  for (let i = TOWN_RANK_ORDER.length - 1; i >= 0; i--) {
    const rank = TOWN_RANK_ORDER[i];
    if (meetsRequirement(snapshot, TOWN_RANK_THRESHOLDS[rank])) {
      return rank;
    }
  }
  return 'camp';
}

export interface TownRankAxisProgress {
  label: string;
  current: number;
  required: number;
}

export interface TownRankProgress {
  currentRank: TownRank;
  /** null once currentRank is the max rank (city) - there is nothing further to progress toward. */
  nextRank: TownRank | null;
  /** 0..1 across all four axes combined (each axis clamped to its own 0..1 before averaging), or 1 at max rank. */
  progressFraction: number;
  /** Per-axis breakdown against nextRank's thresholds, only for axes nextRank actually gates - empty at max rank. Feeds a "what's needed next" UI readout. */
  whatIsNeeded: TownRankAxisProgress[];
}

/** Fraction of the way from 0 to `required`, clamped to [0, 1]. A requirement of 0 (shouldn't occur given the thresholds table, but keeps this pure/total) reads as already met. */
function axisFraction(current: number, required: number): number {
  if (required <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, current / required));
}

/**
 * "Next rank at..." readout for the UI (ObjectivesPanel). At the max rank,
 * `nextRank` is null and `progressFraction` reports 1 with an empty
 * `whatIsNeeded` list rather than throwing or dividing by zero.
 */
export function getRankProgress(snapshot: TownRankSnapshot): TownRankProgress {
  const currentRank = getRankForSnapshot(snapshot);
  const currentIndex = TOWN_RANK_ORDER.indexOf(currentRank);
  const nextRank = currentIndex < TOWN_RANK_ORDER.length - 1 ? TOWN_RANK_ORDER[currentIndex + 1] : null;

  if (!nextRank) {
    return { currentRank, nextRank: null, progressFraction: 1, whatIsNeeded: [] };
  }

  const requirement = TOWN_RANK_THRESHOLDS[nextRank];
  const whatIsNeeded: TownRankAxisProgress[] = [];
  const fractions: number[] = [];

  if (requirement.netWorthAtLeast !== undefined) {
    whatIsNeeded.push({ label: 'Net Worth', current: snapshot.netWorth, required: requirement.netWorthAtLeast });
    fractions.push(axisFraction(snapshot.netWorth, requirement.netWorthAtLeast));
  }
  if (requirement.daysSurvivedAtLeast !== undefined) {
    whatIsNeeded.push({ label: 'Days', current: snapshot.daysSurvived, required: requirement.daysSurvivedAtLeast });
    fractions.push(axisFraction(snapshot.daysSurvived, requirement.daysSurvivedAtLeast));
  }
  if (requirement.totalPopulationAtLeast !== undefined) {
    whatIsNeeded.push({
      label: 'Population',
      current: snapshot.totalPopulation,
      required: requirement.totalPopulationAtLeast,
    });
    fractions.push(axisFraction(snapshot.totalPopulation, requirement.totalPopulationAtLeast));
  }
  if (requirement.completedObjectivesAtLeast !== undefined) {
    whatIsNeeded.push({
      label: 'Objectives',
      current: snapshot.completedObjectives,
      required: requirement.completedObjectivesAtLeast,
    });
    fractions.push(axisFraction(snapshot.completedObjectives, requirement.completedObjectivesAtLeast));
  }

  const progressFraction = fractions.length > 0 ? fractions.reduce((a, b) => a + b, 0) / fractions.length : 1;

  return { currentRank, nextRank, progressFraction, whatIsNeeded };
}
