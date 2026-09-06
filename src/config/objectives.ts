import { ResourceKey, formatResourceMap } from './buildingConfig';

/**
 * Phase 56: Objectives / Quest Chain. A small, self-contained config module
 * (matching resourceGraph.ts's shape - pure data/derivation, no gameState
 * import) so gameState.ts can evaluate every definition's `getProgress`
 * against a plain snapshot object it builds itself each tick, rather than
 * this file reaching back into gameState and risking a cycle.
 *
 * `getProgress` returns the *current* value toward `target`, not a boolean -
 * gameState.runObjectivesCheck clamps it into `[0, target]` and treats
 * `progress >= target` as complete, and the same number backs the UI's
 * "32/50" readout. A definition never mutates anything; all the actual
 * counters it reads (cumulativeSold, totalUnitsTrained,
 * nightsSurvivedCleanCount) are tracked by gameState.ts as new module state.
 */
export interface ObjectiveSnapshot {
  /** Run-lifetime total of each resource ever sold via Supermarket/Saloon/Trading Post combined - never decrements, unlike the resource pool itself. */
  cumulativeSold: Partial<Record<ResourceKey, number>>;
  totalPopulation: number;
  /** computeNetWorth().total, read fresh each check - a snapshot only in the sense that it's evaluated once per tick, not cached across ticks. */
  netWorthTotal: number;
  /** Currently-standing Watchtower count (not cumulative-ever-built) - simplest read, and a Watchtower lost to raiders is a real loss the player should have to replace anyway. */
  watchtowerCount: number;
  /** Cumulative Cowboy + Cowboy-on-Horse units ever completed out of a training queue - unlike cowboyCount/mountedCowboyCount, never decrements when a unit dies. */
  totalUnitsTrained: number;
  /** Cumulative count of full night phases that ended with zero buildings lost during them - not required to be consecutive. */
  nightsSurvivedCleanCount: number;
}

export interface ObjectiveReward {
  money?: number;
  materials?: Partial<Record<ResourceKey, number>>;
}

export interface ObjectiveDefinition {
  id: string;
  description: string;
  target: number;
  /** Short unit label for the progress readout ("32/50 Clothes"); omitted for plain-number objectives like net worth, where the description already reads naturally with a bare "$3200/$5000". */
  unit?: string;
  getProgress: (snapshot: ObjectiveSnapshot) => number;
  reward: ObjectiveReward;
}

/**
 * Deliberately in a fixed, deterministic order rather than shuffled - the
 * rolling active-3 queue (gameState's objectiveQueue) walks this array in
 * declaration order, so two runs progress through the same quest sequence and
 * are comparable. Eight objectives spanning economy (sales/net worth),
 * population growth and military/survival, per the roadmap item's brief.
 */
export const OBJECTIVE_DEFINITIONS: ObjectiveDefinition[] = [
  {
    id: 'ship-50-clothes',
    description: 'Ship 50 Clothes',
    target: 50,
    unit: 'Clothes',
    getProgress: (s) => s.cumulativeSold.clothes ?? 0,
    reward: { money: 100 },
  },
  {
    id: 'reach-population-10',
    description: 'Reach Population 10',
    target: 10,
    unit: 'Population',
    getProgress: (s) => s.totalPopulation,
    reward: { money: 150 },
  },
  {
    id: 'survive-3-nights-clean',
    description: 'Survive 3 Nights Without Losing a Building',
    target: 3,
    unit: 'Nights',
    getProgress: (s) => s.nightsSurvivedCleanCount,
    reward: { money: 200 },
  },
  {
    id: 'build-3-watchtowers',
    description: 'Build 3 Watchtowers',
    target: 3,
    unit: 'Watchtowers',
    getProgress: (s) => s.watchtowerCount,
    reward: { materials: { wood: 10 } },
  },
  {
    id: 'reach-net-worth-5000',
    description: 'Reach Net Worth $5000',
    target: 5000,
    getProgress: (s) => s.netWorthTotal,
    reward: { money: 300 },
  },
  {
    id: 'ship-20-tools',
    description: 'Ship 20 Tools',
    target: 20,
    unit: 'Tools',
    getProgress: (s) => s.cumulativeSold.tools ?? 0,
    reward: { money: 250 },
  },
  {
    id: 'train-5-cowboys',
    description: 'Train 5 Cowboys',
    target: 5,
    unit: 'Cowboys',
    getProgress: (s) => s.totalUnitsTrained,
    reward: { money: 150 },
  },
  {
    id: 'sell-30-liquor',
    description: 'Sell 30 Liquor',
    target: 30,
    unit: 'Liquor',
    getProgress: (s) => s.cumulativeSold.liquor ?? 0,
    reward: { money: 120 },
  },
];

export const OBJECTIVE_DEFINITIONS_BY_ID: ReadonlyMap<string, ObjectiveDefinition> = new Map(
  OBJECTIVE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/** "+$100" / "+10 Wood" / "+$100 +10 Wood" - the notification-log and UI text for a just-completed objective's payout. */
export function formatObjectiveReward(reward: ObjectiveReward): string {
  const parts: string[] = [];
  if (reward.money) {
    parts.push(`+$${reward.money}`);
  }
  if (reward.materials && Object.keys(reward.materials).length > 0) {
    parts.push(`+${formatResourceMap(reward.materials)}`);
  }
  return parts.join(' ');
}

/** "32/50 Clothes" / "$3200/$5000" (unit-less objectives fall back to a bare number pair) - shared by the objectives panel and any future tooltip. */
export function formatObjectiveProgress(definition: Pick<ObjectiveDefinition, 'target' | 'unit'>, progress: number): string {
  const rounded = Math.floor(progress * 10) / 10;
  if (!definition.unit) {
    return `$${rounded}/$${definition.target}`;
  }
  return `${rounded}/${definition.target} ${definition.unit}`;
}
