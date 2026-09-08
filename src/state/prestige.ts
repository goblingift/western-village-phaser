import { Difficulty } from '../config/constants';
import { TOWN_RANK_ORDER, TownRank } from '../config/townRank';

/**
 * Phase 84: Prestige / "Establish a New Town" - the terminal meta-progression
 * loop for an Endless-default game with no difficulty plateau (Phase 80 made
 * raids scale forever, so a run's own economy eventually always loses to
 * escalation). Until now a finished run's only payoff was a records.ts
 * scoreboard entry that never carried forward. This module is a small,
 * standalone localStorage-backed store of ACCOUNT-level progress - legacy
 * points and the permanent upgrades bought with them - modeled directly on
 * records.ts's own read/write shape (own versioned key, every browser
 * failure mode degrades to a safe default rather than throwing) but kept as
 * a genuinely separate file/key, exactly like records.ts is kept separate
 * from persistence.ts: prestige progress must survive every in-progress save
 * being deleted, and it is never part of a resumable SaveGameV1 payload.
 *
 * Pure-derivation split, matching townRank.ts/objectives.ts: this file's
 * legacy-earning FORMULA (computeLegacyEarned) takes a plain snapshot object
 * and a difficulty and returns a number - no gameState import, so it stays
 * testable and free of the import-cycle risk every other standalone state
 * module (vegetation/market/notifications/worldEvents/townRank) also avoids.
 * gameState.ts is the impure orchestrator: it builds the snapshot from live
 * state and calls earnLegacy() to actually persist the result.
 */

/** Bumped only if the stored shape changes incompatibly; a mismatch is discarded rather than migrated (a lost legacy total is a real loss, but a corrupt/foreign value is not worth a migration path for a single small blob). */
const PRESTIGE_VERSION = 1;

/** Matches records.ts's `western-village-records` / persistence.ts's `western-village-save-` prefix convention. */
const PRESTIGE_STORAGE_KEY = 'western-village-prestige';

export interface PrestigeState {
  legacyPoints: number;
  /** Lifetime count of "Establish a New Town" cash-outs - distinct from records.ts's per-combo runsCompleted, since this counts only the voluntary prestige path, not every game-over. */
  townsFounded: number;
  /** Ids of every currently-purchased upgrade. See PrestigeUpgrade.stackable for whether an id can appear more than once (stored as one entry per stack level bought, so `purchasedUpgradeIds.filter(id => id === x).length` is a stack's owned level). */
  purchasedUpgradeIds: string[];
}

interface PrestigeSaveState {
  version: number;
  state: PrestigeState;
}

function emptyState(): PrestigeState {
  return { legacyPoints: 0, townsFounded: 0, purchasedUpgradeIds: [] };
}

/**
 * Reads the whole store, tolerating every failure mode a browser can throw at
 * it (localStorage disabled/full in private mode, a corrupt or foreign value
 * under our key, a future version). Any of those degrade to a fresh empty
 * state rather than crashing whatever screen asked for it, matching
 * records.ts's readStore exactly.
 */
function readStore(): PrestigeState {
  try {
    const raw = localStorage.getItem(PRESTIGE_STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw) as PrestigeSaveState;
    if (!parsed || parsed.version !== PRESTIGE_VERSION || typeof parsed.state !== 'object' || parsed.state === null) {
      return emptyState();
    }
    const state = parsed.state;
    if (
      typeof state.legacyPoints !== 'number' ||
      typeof state.townsFounded !== 'number' ||
      !Array.isArray(state.purchasedUpgradeIds)
    ) {
      return emptyState();
    }
    return {
      legacyPoints: state.legacyPoints,
      townsFounded: state.townsFounded,
      purchasedUpgradeIds: state.purchasedUpgradeIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return emptyState();
  }
}

function writeStore(state: PrestigeState): void {
  try {
    const payload: PrestigeSaveState = { version: PRESTIGE_VERSION, state };
    localStorage.setItem(PRESTIGE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable/full (private-mode Safari, quota exceeded, etc) -
    // prestige is a nice-to-have meta layer, so failing to persist one
    // purchase/award must never interrupt the run itself.
  }
}

export function getPrestigeState(): PrestigeState {
  return readStore();
}

export function getLegacyPoints(): number {
  return readStore().legacyPoints;
}

/** Adds legacy points earned from a finished run (either path - see gameState's endGame/establishNewTown). Amounts are floored to whole points before storing, since fractional legacy has no UI meaning. */
export function earnLegacy(amount: number): number {
  const whole = Math.max(0, Math.floor(amount));
  if (whole <= 0) {
    return getLegacyPoints();
  }
  const state = readStore();
  state.legacyPoints += whole;
  writeStore(state);
  return state.legacyPoints;
}

/**
 * Phase 84: the starting prestige shop. Kept deliberately small (4-6
 * entries) per the phase's own scope limit - it can grow later. Every
 * upgrade is "stackable" in the sense that purchaseUpgrade never blocks a
 * repeat buy on its own; `maxStacks` (1 for the population/upkeep upgrades,
 * which would otherwise be either meaningless past a point or capable of
 * zeroing/negating upkeep entirely) is what actually caps repeat purchases.
 * Cost scales per stack level already owned (`costForStack`) rather than
 * staying flat, so a maxStacks > 1 upgrade doesn't trivially dominate a
 * maxStacks === 1 one of similar early cost.
 */
export interface PrestigeUpgrade {
  id: string;
  label: string;
  description: string;
  /** Cost in legacy points for the (stackLevel+1)-th purchase, stackLevel being how many are already owned (0-indexed). */
  costForStack: (stackLevel: number) => number;
  /** How many times this upgrade can be purchased. 1 = one-time; >1 = stacks additively per getActivePrestigeModifiers. */
  maxStacks: number;
}

export const PRESTIGE_UPGRADES: PrestigeUpgrade[] = [
  {
    id: 'grubstake',
    label: 'Grubstake',
    description: '+$250 starting money per stack.',
    costForStack: (stackLevel) => 150 + stackLevel * 120,
    maxStacks: 5,
  },
  {
    id: 'trail-wagon',
    label: 'Trail Wagon',
    description: '+5 Wood and +3 Tools on hand at the start of every new town, per stack.',
    costForStack: (stackLevel) => 120 + stackLevel * 100,
    maxStacks: 5,
  },
  {
    id: 'kinfolk',
    label: 'Kinfolk',
    description: '+1 permanent population capacity per stack, independent of your Houses.',
    costForStack: (stackLevel) => 200 + stackLevel * 180,
    maxStacks: 4,
  },
  {
    id: 'frontier-ledger',
    label: 'Frontier Ledger',
    description: '-5% building upkeep, permanently. One-time.',
    costForStack: () => 260,
    maxStacks: 1,
  },
  {
    id: 'homestead-charter',
    label: 'Homestead Charter',
    description: '+15% starting money, permanently (stacks with Grubstake, applied after it). One-time.',
    costForStack: () => 320,
    maxStacks: 1,
  },
  {
    id: 'iron-resolve',
    label: 'Iron Resolve',
    description: '-3% building upkeep, permanently. One-time (stacks with Frontier Ledger).',
    costForStack: () => 420,
    maxStacks: 1,
  },
];

export const PRESTIGE_UPGRADES_BY_ID: Record<string, PrestigeUpgrade> = Object.fromEntries(
  PRESTIGE_UPGRADES.map((upgrade) => [upgrade.id, upgrade]),
);

/** How many copies of `upgradeId` are currently owned. */
export function getOwnedStackCount(upgradeId: string): number {
  return readStore().purchasedUpgradeIds.filter((id) => id === upgradeId).length;
}

/** Legacy-point cost of the NEXT purchase of `upgradeId`, or null if it's already at its max stack. */
export function getNextUpgradeCost(upgradeId: string): number | null {
  const upgrade = PRESTIGE_UPGRADES_BY_ID[upgradeId];
  if (!upgrade) {
    return null;
  }
  const owned = getOwnedStackCount(upgradeId);
  if (owned >= upgrade.maxStacks) {
    return null;
  }
  return upgrade.costForStack(owned);
}

export type PurchaseUpgradeResult = 'purchased' | 'unknown-upgrade' | 'max-stacks-reached' | 'not-enough-legacy';

/** Spends legacy points to buy one more stack of an upgrade, if affordable and not already maxed. */
export function purchaseUpgrade(upgradeId: string): PurchaseUpgradeResult {
  const upgrade = PRESTIGE_UPGRADES_BY_ID[upgradeId];
  if (!upgrade) {
    return 'unknown-upgrade';
  }
  const state = readStore();
  const owned = state.purchasedUpgradeIds.filter((id) => id === upgradeId).length;
  if (owned >= upgrade.maxStacks) {
    return 'max-stacks-reached';
  }
  const cost = upgrade.costForStack(owned);
  if (state.legacyPoints < cost) {
    return 'not-enough-legacy';
  }
  state.legacyPoints -= cost;
  state.purchasedUpgradeIds.push(upgradeId);
  writeStore(state);
  return 'purchased';
}

/**
 * The composed effect of every currently-purchased upgrade, in the shape
 * gameState's resetGame()/runUpkeep() actually consume. Additive bonuses sum
 * stack-for-stack; the upkeep discount composes multiplicatively across the
 * distinct percentage upgrades (Frontier Ledger x Iron Resolve), matching how
 * DIFFICULTY_SETTINGS.upkeepMultiplier itself is one multiplicative factor
 * gameState.runUpkeep already applies - this is a SECOND, independent
 * multiplicative factor layered on top of it, never a replacement.
 */
export interface PrestigeModifiers {
  startingMoneyBonus: number;
  /** Multiplies starting money AFTER startingMoneyBonus is added (Homestead Charter), composing with DIFFICULTY_SETTINGS.startingMoneyMultiplier the same way that multiplier already composes with STARTING_MONEY. */
  startingMoneyMultiplier: number;
  startingWoodBonus: number;
  startingToolsBonus: number;
  /** Flat, permanent population-capacity bonus (Kinfolk) - applied every tick in assignWorkforce, not just at reset, since it represents kin who are always around rather than a one-time stipend. */
  permanentPopulationBonus: number;
  /** Multiplies each building's per-tick upkeep, alongside (not instead of) DIFFICULTY_SETTINGS.upkeepMultiplier. 1 = no discount. */
  upkeepDiscountMultiplier: number;
}

export function getActivePrestigeModifiers(): PrestigeModifiers {
  const state = readStore();
  const counts = new Map<string, number>();
  for (const id of state.purchasedUpgradeIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const grubstake = counts.get('grubstake') ?? 0;
  const trailWagon = counts.get('trail-wagon') ?? 0;
  const kinfolk = counts.get('kinfolk') ?? 0;
  const frontierLedger = counts.get('frontier-ledger') ?? 0;
  const homesteadCharter = counts.get('homestead-charter') ?? 0;
  const ironResolve = counts.get('iron-resolve') ?? 0;

  return {
    startingMoneyBonus: grubstake * 250,
    startingMoneyMultiplier: homesteadCharter > 0 ? 1.15 : 1,
    startingWoodBonus: trailWagon * 5,
    startingToolsBonus: trailWagon * 3,
    permanentPopulationBonus: kinfolk * 1,
    upkeepDiscountMultiplier: (frontierLedger > 0 ? 0.95 : 1) * (ironResolve > 0 ? 0.97 : 1),
  };
}

/**
 * Legacy-earning snapshot: the minimal set of values the formula needs,
 * mirroring townRank.ts's TownRankSnapshot shape/rationale exactly (a plain
 * data object so this file never has to import gameState). `rank` is passed
 * in already-derived (gameState computes it via getTownRank()) rather than
 * recomputed here, since re-deriving it would require importing the full
 * TOWN_RANK_THRESHOLDS evaluation this module has no reason to duplicate.
 */
export interface LegacySnapshot {
  rank: TownRank;
  netWorth: number;
  daysSurvived: number;
}

/** Index into TOWN_RANK_ORDER, i.e. 0 (camp) .. 5 (city). */
function rankIndex(rank: TownRank): number {
  const index = TOWN_RANK_ORDER.indexOf(rank);
  return index >= 0 ? index : 0;
}

/**
 * Per-difficulty legacy multiplier. Deliberately NOT reusing
 * DIFFICULTY_SETTINGS' existing fields directly (none of
 * startingMoneyMultiplier/upkeepMultiplier/raidEscalationMultiplier mean
 * "how rewarding was this difficulty to play", and repurposing one of them
 * would silently couple two unrelated tuning knobs) - a small dedicated table
 * here instead, still keyed by the same Difficulty type so it can never fall
 * out of sync with which difficulties exist. Hard earns meaningfully more
 * (harder economy/faster raids = a harder-won result) and Easy meaningfully
 * less, so grinding Easy resets is not the efficient way to buy the shop.
 */
const LEGACY_DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  easy: 0.6,
  normal: 1,
  hard: 1.6,
};

export function getLegacyDifficultyMultiplier(difficulty: Difficulty): number {
  return LEGACY_DIFFICULTY_MULTIPLIER[difficulty] ?? 1;
}

/**
 * Pure legacy-earning formula. Base points scale with the town's derived
 * rank (the single clearest "how far did this run get" signal, per Phase 83)
 * plus smaller direct contributions from net worth and days survived so two
 * runs landing on the same rank still differ a little by how far past that
 * rank's thresholds they pushed - then the whole total is scaled by the
 * run's difficulty multiplier.
 *
 * `isVoluntaryCashOut` adds a flat CASH_OUT_BONUS_FRACTION bonus on top: a
 * player who chooses to end a healthy, still-winnable town early (gated by
 * canEstablishNewTown's rank/day minimum in gameState.ts) is making a
 * deliberate, costly choice - giving up a run that could still climb further
 * - which deserves a premium over the same snapshot simply being read off a
 * town that just got destroyed out from under the player with no say in the
 * matter. This keeps the two paths close enough that only-ever-dying still
 * earns real, comparable legacy (per the "both paths" design requirement),
 * while making prestige-cashing feel like a genuinely rewarded decision
 * rather than a strictly-worse alternative to simply playing until you lose.
 */
const RANK_BASE_LEGACY: Record<TownRank, number> = {
  camp: 5,
  hamlet: 20,
  village: 45,
  town: 90,
  boomtown: 170,
  city: 300,
};

const CASH_OUT_BONUS_FRACTION = 0.2;

export function computeLegacyEarned(
  snapshot: LegacySnapshot,
  difficulty: Difficulty,
  isVoluntaryCashOut: boolean,
): number {
  const rankBase = RANK_BASE_LEGACY[snapshot.rank] ?? RANK_BASE_LEGACY.camp;
  // Small continuous contributions so two runs at the same rank aren't
  // scored identically - deliberately gentle (rankIndex+1 damps early ranks)
  // so these never eclipse the rank-tier jump itself.
  const netWorthContribution = (snapshot.netWorth / 1000) * (rankIndex(snapshot.rank) + 1) * 0.5;
  const daysContribution = snapshot.daysSurvived * (rankIndex(snapshot.rank) + 1) * 0.8;

  const subtotal = rankBase + netWorthContribution + daysContribution;
  const difficultyScaled = subtotal * getLegacyDifficultyMultiplier(difficulty);
  const final = isVoluntaryCashOut ? difficultyScaled * (1 + CASH_OUT_BONUS_FRACTION) : difficultyScaled;

  return Math.max(0, Math.round(final));
}

/** Records a completed "Establish a New Town" cash-out (townsFounded counter only - the legacy award itself goes through earnLegacy separately, called by gameState.establishNewTown). */
export function recordTownFounded(): void {
  const state = readStore();
  state.townsFounded += 1;
  writeStore(state);
}

/** Test/debug hook, and the natural home for any future "reset my prestige progress" UI - mirrors records.ts's clearRecords. */
export function resetPrestigeState(): void {
  try {
    localStorage.removeItem(PRESTIGE_STORAGE_KEY);
  } catch {
    // Same rationale as writeStore's swallow.
  }
}
