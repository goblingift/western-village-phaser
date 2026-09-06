import {
  BASE_MARKET_PRICES,
  MARKETABLE_RESOURCE_KEYS,
  MarketableResourceKey,
} from '../config/buildingConfig';
import {
  MARKET_ABSOLUTE_FLOOR_FRACTION,
  MARKET_DRIFT_MAX_FRACTION,
  MARKET_MAX_PRESSURE_FRACTION,
  MARKET_PRESSURE_PER_UNIT,
  MARKET_PRESSURE_WINDOW_TICKS,
  MARKET_PRICE_CEIL_FRACTION,
  MARKET_PRICE_FLOOR_FRACTION,
} from '../config/constants';

/**
 * Phase 51: Trading Post & Fluctuating Prices. A standalone state module,
 * matching vegetation.ts/notifications.ts - a distinct concern with its own
 * storage that every seller (runSupermarketSales/runSaloonSales/
 * runTradingPostSales in gameState.ts) reads and writes into, without
 * gameState.ts having to own the drift/pressure/merchant-deal math directly.
 * Deliberately does NOT import gameState.ts (no cycle risk, same rule
 * vegetation.ts/notifications.ts follow): `elapsedSeconds` is passed in by
 * whichever caller already has it in scope.
 *
 * Two layers make up a resource's price:
 *  - `baselinePrice`: a slow, unbounded-feeling random walk (+/-
 *    MARKET_DRIFT_MAX_FRACTION per tick) clamped to
 *    [MARKET_PRICE_FLOOR_FRACTION, MARKET_PRICE_CEIL_FRACTION] x its
 *    BASE_MARKET_PRICES peg - "the market is having a good/bad week".
 *  - `pressure`: a temporary penalty driven by how much of that resource has
 *    actually sold in the last MARKET_PRESSURE_WINDOW_TICKS ticks (rolling
 *    window, same shape as Phase 49's productivity tracking) - "you just
 *    flooded the market with this, so it's worth less right now". This
 *    decays back toward 0 on its own as old ticks roll out of the window,
 *    with no separate decay step needed.
 *
 * `currentMarketPrice = baselinePrice * (1 - pressure) * merchantMultiplier`,
 * floored at MARKET_ABSOLUTE_FLOOR_FRACTION of the peg so a bad-luck baseline
 * plus max pressure still leaves a sellable, non-zero price.
 *
 * runMarketTick is called once per production tick, before the sell passes
 * run, so this tick's sales read a price that already reflects everything up
 * through the *previous* tick's volume; this tick's own volume is recorded
 * via recordMarketSaleVolume and only feeds the window on the *next* call.
 * That one-tick lag is deliberate - it means a single sale can't discount
 * itself mid-tick, which would make a Trading Post order chase its own tail.
 */

export interface MerchantDeal {
  key: MarketableResourceKey;
  multiplier: number;
  expiresAtElapsedSeconds: number;
}

/** Phase 52: everything this module owns, for a save payload - see persistence.ts. */
export interface MarketSaveState {
  baselinePrice: Record<MarketableResourceKey, number>;
  currentPrice: Record<MarketableResourceKey, number>;
  volumeWindow: Record<MarketableResourceKey, number[]>;
  pendingVolume: Partial<Record<MarketableResourceKey, number>>;
  merchantDeal: MerchantDeal | null;
}

function emptyVolumeWindows(): Record<MarketableResourceKey, number[]> {
  const record = {} as Record<MarketableResourceKey, number[]>;
  for (const key of MARKETABLE_RESOURCE_KEYS) {
    record[key] = [];
  }
  return record;
}

let baselinePrice: Record<MarketableResourceKey, number> = { ...BASE_MARKET_PRICES };
let currentPrice: Record<MarketableResourceKey, number> = { ...BASE_MARKET_PRICES };
let volumeWindow: Record<MarketableResourceKey, number[]> = emptyVolumeWindows();
let pendingVolume: Partial<Record<MarketableResourceKey, number>> = {};
let merchantDeal: MerchantDeal | null = null;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Called from gameState.resetGame so a fresh run doesn't inherit the previous run's drifted prices/pressure/deal. */
export function resetMarket(): void {
  baselinePrice = { ...BASE_MARKET_PRICES };
  currentPrice = { ...BASE_MARKET_PRICES };
  volumeWindow = emptyVolumeWindows();
  pendingVolume = {};
  merchantDeal = null;
}

/** Called by every sell pass (Supermarket/Saloon/Trading Post) right after it sells - accumulates into next tick's pressure window. */
export function recordMarketSaleVolume(key: MarketableResourceKey, amount: number): void {
  if (amount <= 0) {
    return;
  }
  pendingVolume[key] = (pendingVolume[key] ?? 0) + amount;
}

export function getCurrentMarketPrice(key: MarketableResourceKey): number {
  return currentPrice[key];
}

/** The slow-drifting peg itself, without this tick's supply pressure/merchant deal folded in - used by the HUD to show an up/down arrow against "normal". */
export function getBaselineMarketPrice(key: MarketableResourceKey): number {
  return baselinePrice[key];
}

export function getActiveMerchantDeal(): Readonly<MerchantDeal> | null {
  return merchantDeal;
}

/** Started by MainScene's self-rescheduling merchant timer (mirrors scheduleNextRaidCheck). */
export function startMerchantDeal(
  key: MarketableResourceKey,
  multiplier: number,
  durationSeconds: number,
  elapsedSeconds: number,
): void {
  merchantDeal = { key, multiplier, expiresAtElapsedSeconds: elapsedSeconds + durationSeconds };
}

/**
 * One production tick's worth of market movement: fold last tick's recorded
 * volume into the rolling window, drift every baseline, expire a finished
 * merchant deal, then recompute every resource's currentMarketPrice from
 * those three inputs.
 */
export function runMarketTick(elapsedSeconds: number): void {
  if (merchantDeal && elapsedSeconds >= merchantDeal.expiresAtElapsedSeconds) {
    merchantDeal = null;
  }

  for (const key of MARKETABLE_RESOURCE_KEYS) {
    const peg = BASE_MARKET_PRICES[key];

    const window = volumeWindow[key];
    window.push(pendingVolume[key] ?? 0);
    if (window.length > MARKET_PRESSURE_WINDOW_TICKS) {
      window.shift();
    }

    const drift = (Math.random() * 2 - 1) * MARKET_DRIFT_MAX_FRACTION;
    const driftedBaseline = baselinePrice[key] * (1 + drift);
    baselinePrice[key] = Math.min(
      peg * MARKET_PRICE_CEIL_FRACTION,
      Math.max(peg * MARKET_PRICE_FLOOR_FRACTION, driftedBaseline),
    );

    const recentVolume = window.reduce((sum, value) => sum + value, 0);
    const pressure = Math.min(MARKET_MAX_PRESSURE_FRACTION, recentVolume * MARKET_PRESSURE_PER_UNIT);

    const dealMultiplier = merchantDeal && merchantDeal.key === key ? merchantDeal.multiplier : 1;
    const priced = baselinePrice[key] * (1 - pressure) * dealMultiplier;
    currentPrice[key] = round2(Math.max(peg * MARKET_ABSOLUTE_FLOOR_FRACTION, priced));
  }

  pendingVolume = {};
}

/** Phase 52: snapshot for a save payload - see persistence.ts. */
export function serializeMarket(): MarketSaveState {
  return {
    baselinePrice: { ...baselinePrice },
    currentPrice: { ...currentPrice },
    volumeWindow: Object.fromEntries(
      MARKETABLE_RESOURCE_KEYS.map((key) => [key, [...volumeWindow[key]]]),
    ) as Record<MarketableResourceKey, number[]>,
    pendingVolume: { ...pendingVolume },
    merchantDeal: merchantDeal ? { ...merchantDeal } : null,
  };
}

/** Phase 52: the inverse of serializeMarket, called from persistence.deserializeGameState after resetGame's own resetMarket() has already run. */
export function restoreMarket(state: MarketSaveState): void {
  baselinePrice = { ...state.baselinePrice };
  currentPrice = { ...state.currentPrice };
  volumeWindow = Object.fromEntries(
    MARKETABLE_RESOURCE_KEYS.map((key) => [key, [...(state.volumeWindow[key] ?? [])]]),
  ) as Record<MarketableResourceKey, number[]>;
  pendingVolume = { ...state.pendingVolume };
  merchantDeal = state.merchantDeal ? { ...state.merchantDeal } : null;
}
