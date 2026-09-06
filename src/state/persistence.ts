import { CYCLE_SECONDS, Difficulty, RunMode } from '../config/constants';
import { PlacedBuilding } from '../config/buildingConfig';
import { gameEvents } from './gameEvents';
import {
  Resources,
  getCurrentDifficulty,
  getCurrentRunMode,
  getDayNumber,
  getDayPhase,
  getElapsedSeconds,
  getMoney,
  getPhaseRemainingSeconds,
  getPlacedBuildings,
  getResources,
  getTotalMeatProduced,
  recomputeWorkforceNow,
  resetGame,
  restoreBuilding,
  restoreCoreState,
  silentlySyncUnlockNotifications,
  updateConnections,
} from './gameState';
import { addNotification } from './notifications';
import { MarketSaveState, restoreMarket, serializeMarket } from './market';
import { VegetationEntity, getVegetation, restoreVegetationEntities } from './vegetation';

/**
 * Phase 52: Save / Load + Autosave.
 *
 * Scope, spelled out explicitly because it's easy to assume more was saved
 * than actually was:
 *  - SAVED: money, the resource pool, elapsedSeconds (and therefore day
 *    number/phase), difficulty, run mode, total meat produced, every
 *    PlacedBuilding (including per-building HP, animals, bank balance,
 *    garrisoned Cowboy/Cowboy-on-Horse counts+HP, house tier, trade orders,
 *    Phase 53's in-progress trainingQueue (a queued job's remainingTicks
 *    resumes counting down exactly where it left off) and rallyPoint, etc.),
 *    every live vegetation entity, and the full fluctuating-market state
 *    (baseline prices, pressure windows, any active merchant deal).
 *  - NOT SAVED (reset to fresh-game defaults on load), by design:
 *      - `resourceHistory` (Phase 49's rolling sparkline buffers) - purely
 *        cosmetic, and re-populates itself over the next
 *        RESOURCE_HISTORY_LENGTH ticks regardless.
 *      - The notification log - a scrollback of past events, not town state;
 *        starting it empty after a load is no different from starting a new
 *        session that happens to already own some buildings.
 *      - Any MainScene-local, ephemeral combat state: live unit
 *        x/y positions, in-flight move tweens/orders, selection/control
 *        groups, and any raid wave in progress. A garrisoned Cowboy or
 *        Cowboy-on-Horse's *count and HP* travel with its training building
 *        (they're plain PlacedBuilding fields) and are re-spawned at that
 *        building's static home slot on load; but a unit that was mid-stride
 *        toward a move order, or a raider wave mid-fight, is not
 *        reconstructed - loading resumes the town, not a frozen battle.
 */
export const SAVE_FORMAT_VERSION = 1 as const;

export const MANUAL_SAVE_SLOT = 'manual';
export const AUTOSAVE_SLOT = 'autosave';

const STORAGE_KEY_PREFIX = 'western-village-save-';

export interface SaveGameV1 {
  version: 1;
  savedAtIso: string;
  money: number;
  resources: Resources;
  elapsedSeconds: number;
  difficulty: Difficulty;
  runMode: RunMode;
  totalMeatProduced: number;
  placedBuildings: PlacedBuilding[];
  vegetation: VegetationEntity[];
  market: MarketSaveState;
}

export interface SaveSlotInfo {
  name: string;
  savedAtIso: string;
  /** Cosmetic estimate for a slot picker/"Continue" tooltip - derived straight from the save's elapsedSeconds, ignoring Fixed mode's DAY_COUNT cap. */
  dayNumber: number;
  buildingCount: number;
}

/** Deep-enough clone of one PlacedBuilding for a save payload - the plain scalar/array/record fields all round-trip through JSON fine, but the arrays/records need their own copies so a save doesn't alias the live building. */
function cloneBuilding(building: PlacedBuilding): PlacedBuilding {
  return {
    ...building,
    cowboyHp: [...building.cowboyHp],
    mountedCowboyHp: [...building.mountedCowboyHp],
    houseNeedsStatus: building.houseNeedsStatus.map((entry) => ({ ...entry })),
    tradeOrders: { ...building.tradeOrders },
    // Phase 53: trainingQueue's job objects and rallyPoint's {x,y} are their
    // own plain objects, not shared with the live building, for the same
    // anti-aliasing reason as the arrays/records above.
    trainingQueue: building.trainingQueue.map((job) => ({ ...job })),
    rallyPoint: building.rallyPoint ? { ...building.rallyPoint } : undefined,
  };
}

export function serializeGameState(): SaveGameV1 {
  return {
    version: SAVE_FORMAT_VERSION,
    savedAtIso: new Date().toISOString(),
    money: getMoney(),
    resources: { ...getResources() },
    elapsedSeconds: getElapsedSeconds(),
    difficulty: getCurrentDifficulty(),
    runMode: getCurrentRunMode(),
    totalMeatProduced: getTotalMeatProduced(),
    placedBuildings: getPlacedBuildings().map(cloneBuilding),
    vegetation: getVegetation().map((entity) => ({ ...entity })),
    market: serializeMarket(),
  };
}

/**
 * Applies a save payload to the live game. A version mismatch (or any other
 * structural problem while applying it) is surfaced through the notification
 * log and otherwise a no-op on the current run, rather than thrown - a
 * corrupt or foreign localStorage value must never crash the scene.
 *
 * Order matters here and mirrors the doc comment on 'game-loaded'
 * (gameEvents.ts): resetGame() first (wipes the previous run's buildings/
 * visuals and reseeds a throwaway random vegetation layout via its own
 * resetVegetation()), then every loaded field overwrites that fresh-game
 * default, then 'game-loaded' lets MainScene (re)create every building/
 * villager/garrisoned-unit visual from the now-fully-populated gameState,
 * and only after that does updateConnections() run - so its
 * 'connections-updated' redraw has a complete buildingVisuals map to draw
 * outlines/fence-lines against instead of an empty one.
 */
export function deserializeGameState(save: SaveGameV1): void {
  if (!save || save.version !== SAVE_FORMAT_VERSION) {
    addNotification(
      `Cannot load save: unsupported save version (${String(save?.version)})`,
      'danger',
      getElapsedSeconds(),
    );
    return;
  }

  try {
    resetGame({ mode: save.runMode, difficulty: save.difficulty });

    restoreCoreState({
      money: save.money,
      resources: save.resources,
      elapsedSeconds: save.elapsedSeconds,
      totalMeatProduced: save.totalMeatProduced,
    });
    restoreMarket(save.market);
    restoreVegetationEntities(save.vegetation);
    for (const building of save.placedBuildings) {
      restoreBuilding(cloneBuilding(building));
    }
    recomputeWorkforceNow();
    silentlySyncUnlockNotifications();

    gameEvents.emit('game-loaded');
    updateConnections();

    gameEvents.emit('money-changed', getMoney());
    gameEvents.emit('resources-changed', { ...getResources() });
    gameEvents.emit('timer-changed', getPhaseRemainingSeconds());
    gameEvents.emit('day-phase-changed', { dayNumber: getDayNumber(), phase: getDayPhase() });

    addNotification('Game loaded.', 'info', getElapsedSeconds());
  } catch (error) {
    addNotification(`Failed to load save: ${(error as Error).message}`, 'danger', getElapsedSeconds());
  }
}

function slotKey(name: string): string {
  return `${STORAGE_KEY_PREFIX}${name}`;
}

export function saveToSlot(name: string): void {
  const save = serializeGameState();
  try {
    localStorage.setItem(slotKey(name), JSON.stringify(save));
  } catch (error) {
    addNotification(`Failed to save: ${(error as Error).message}`, 'danger', getElapsedSeconds());
  }
}

/** Returns false (and leaves the current run untouched) when the slot doesn't exist; a version mismatch on an existing slot is instead reported via deserializeGameState's own notification. */
export function loadFromSlot(name: string): boolean {
  const raw = localStorage.getItem(slotKey(name));
  if (!raw) {
    return false;
  }

  let parsed: SaveGameV1;
  try {
    parsed = JSON.parse(raw) as SaveGameV1;
  } catch {
    addNotification(`Save slot "${name}" is corrupted and could not be read.`, 'danger', getElapsedSeconds());
    return false;
  }

  deserializeGameState(parsed);
  return true;
}

export function deleteSlot(name: string): void {
  localStorage.removeItem(slotKey(name));
}

export function hasSaveSlot(name: string): boolean {
  return localStorage.getItem(slotKey(name)) !== null;
}

/** Every recognizable save slot present in localStorage, for the pre-game "Continue" button (and any future slot-picker UI). Corrupt entries are silently excluded rather than crashing the listing. */
export function listSaveSlots(): SaveSlotInfo[] {
  const infos: SaveSlotInfo[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) {
      continue;
    }
    const raw = localStorage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as SaveGameV1;
      infos.push({
        name: key.slice(STORAGE_KEY_PREFIX.length),
        savedAtIso: parsed.savedAtIso,
        dayNumber: Math.floor(parsed.elapsedSeconds / CYCLE_SECONDS) + 1,
        buildingCount: parsed.placedBuildings?.length ?? 0,
      });
    } catch {
      // Corrupt/foreign localStorage entry under our prefix - ignore it.
    }
  }

  return infos;
}

/** Whichever of the slots present was saved most recently, for the pre-game "Continue" button - null if none exist. */
export function getMostRecentSaveSlotName(): string | null {
  const slots = listSaveSlots();
  if (slots.length === 0) {
    return null;
  }
  return slots.reduce((latest, candidate) =>
    new Date(candidate.savedAtIso).getTime() > new Date(latest.savedAtIso).getTime() ? candidate : latest,
  ).name;
}
