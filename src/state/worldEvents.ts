import {
  CATTLE_DISEASE_OUTPUT_MULTIPLIER,
  DROUGHT_WELL_OUTPUT_MULTIPLIER,
  DUST_STORM_PRODUCTION_MULTIPLIER,
  GOLD_RUSH_SELL_PRICE_MULTIPLIER,
} from '../config/constants';
import { gameEvents } from './gameEvents';

/**
 * Phase 55: Random World Events. A standalone state module, matching
 * market.ts/vegetation.ts/notifications.ts's shape - a distinct concern with
 * its own transient storage, read every production tick by gameState.ts
 * without gameState having to own event-scheduling math directly. Like those
 * modules, this deliberately does NOT import gameState.ts (no cycle risk):
 * every caller (gameState.ts's production tick, MainScene's self-rescheduling
 * timer) already has `elapsedSeconds` in scope.
 *
 * Only one event is ever active at a time - MainScene's scheduler skips
 * firing a new one while getActiveWorldEvent() is non-null, the same
 * "don't overlap" rule scheduleNextRaidCheck already applies to raid waves.
 * `wanderingSettlers` is the one exception: it's an instant, one-shot reward
 * with no lasting state, so it never occupies this module's active-event
 * slot at all - MainScene calls gameState.applyWanderingSettlersReward()
 * directly instead of startWorldEvent for that type.
 *
 * Effect getters (getDroughtWellMultiplier etc.) are plain 1-or-penalty
 * lookups against the current active event, applied by gameState.ts as an
 * *additional* multiplier layered on top of whatever the affected system
 * already does (e.g. wellOutputMultiplier's existing water-distance falloff)
 * rather than replacing it.
 */
export type WorldEventType = 'drought' | 'goldRush' | 'cattleDisease' | 'dustStorm' | 'wanderingSettlers';

/** The four events with an ongoing duration/effect; wanderingSettlers is instant and never becomes an ActiveWorldEvent. */
export type DurationWorldEventType = Exclude<WorldEventType, 'wanderingSettlers'>;

export interface ActiveWorldEvent {
  type: DurationWorldEventType;
  startedAtElapsedSeconds: number;
  expiresAtElapsedSeconds: number;
}

export const WORLD_EVENT_LABELS: Record<WorldEventType, string> = {
  drought: 'Drought',
  goldRush: 'Gold Rush',
  cattleDisease: 'Cattle Disease',
  dustStorm: 'Dust Storm',
  wanderingSettlers: 'Wandering Settlers',
};

/**
 * Equal-ish weighting, biased slightly toward the three negative events over
 * the two positive ones so a run isn't dominated by good news.
 */
const WORLD_EVENT_WEIGHTS: Record<WorldEventType, number> = {
  drought: 3,
  goldRush: 2,
  cattleDisease: 3,
  dustStorm: 3,
  wanderingSettlers: 2,
};

let activeEvent: ActiveWorldEvent | null = null;

export function getActiveWorldEvent(): Readonly<ActiveWorldEvent> | null {
  return activeEvent;
}

/** Weighted random pick over WORLD_EVENT_WEIGHTS - part of "scheduling", so it lives here rather than in MainScene. */
export function pickRandomWorldEventType(): WorldEventType {
  const entries = Object.entries(WORLD_EVENT_WEIGHTS) as [WorldEventType, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [type, weight] of entries) {
    if (roll < weight) {
      return type;
    }
    roll -= weight;
  }
  return entries[entries.length - 1][0];
}

/** Started by MainScene's self-rescheduling world-event timer (mirrors startMerchantDeal). */
export function startWorldEvent(
  type: DurationWorldEventType,
  durationSeconds: number,
  elapsedSeconds: number,
): void {
  activeEvent = {
    type,
    startedAtElapsedSeconds: elapsedSeconds,
    expiresAtElapsedSeconds: elapsedSeconds + durationSeconds,
  };
  gameEvents.emit('world-event-started', { type, expiresAtElapsedSeconds: activeEvent.expiresAtElapsedSeconds });
}

/** One production tick's worth of world-event bookkeeping: expire a finished event. Called once per tick, like runMarketTick. */
export function runWorldEventsTick(elapsedSeconds: number): void {
  if (activeEvent && elapsedSeconds >= activeEvent.expiresAtElapsedSeconds) {
    const endedType = activeEvent.type;
    activeEvent = null;
    gameEvents.emit('world-event-ended', { type: endedType });
  }
}

/**
 * Called from gameState.resetGame so a fresh run doesn't inherit the previous
 * run's active event. Phase 52 note: world events are transient/ephemeral -
 * like an in-progress raid wave, they are deliberately NOT part of any
 * SaveGameV1 payload (persistence.ts), so a loaded save always resumes with
 * no active world event, exactly like a fresh reset.
 */
export function resetWorldEvents(): void {
  if (activeEvent) {
    const endedType = activeEvent.type;
    activeEvent = null;
    gameEvents.emit('world-event-ended', { type: endedType });
  }
}

function multiplierIfActive(type: DurationWorldEventType, multiplier: number): number {
  return activeEvent?.type === type ? multiplier : 1;
}

/** Layered on top of wellOutputMultiplier's existing water-distance falloff, not a replacement for it. */
export function getDroughtWellMultiplier(): number {
  return multiplierIfActive('drought', DROUGHT_WELL_OUTPUT_MULTIPLIER);
}

/** Read by gameState's animal-output scaling (CattleFarm/PigFarm/CowRanch/ChickenFarm) alongside the existing connected/well/crop bonus multiplier. */
export function getCattleDiseaseMultiplier(): number {
  return multiplierIfActive('cattleDisease', CATTLE_DISEASE_OUTPUT_MULTIPLIER);
}

/** A small flat dip applied to every producing building's output bonus, regardless of type. */
export function getDustStormProductionMultiplier(): number {
  return multiplierIfActive('dustStorm', DUST_STORM_PRODUCTION_MULTIPLIER);
}

/** Multiplies getCurrentMarketPrice(key) at every sell pass (Supermarket/Saloon/Trading Post) - a temporary global spike layered on top of state/market.ts's own drift/pressure/merchant-deal pricing. */
export function getGoldRushMultiplier(): number {
  return multiplierIfActive('goldRush', GOLD_RUSH_SELL_PRICE_MULTIPLIER);
}
