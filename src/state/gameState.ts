import {
  ANIMAL_ENCLOSURE_TILES_PER_ANIMAL,
  BANK_INTEREST_RATE,
  BANK_TRANSACTION_AMOUNT,
  BASE_STORAGE_CAP,
  BRAWLER_MAX_HP,
  BRAWLER_MAX_PER_BARRACKS,
  BRAWLER_TRAIN_COST,
  BRAWLER_TRAIN_TICKS,
  BROTHEL_HOUSES_PER_LADY,
  BROTHEL_INCOME_PER_LADY_PER_HOUSE,
  BROTHEL_LADY_COST,
  BROTHEL_MAX_LADIES,
  BROTHEL_SERVICE_RADIUS_TILES,
  CHURCH_BASE_RADIUS_TILES,
  CHURCH_MAX_CLERGY,
  CHURCH_NUN_COST,
  CHURCH_PRIEST_COST,
  CHURCH_PRIEST_TAX_BONUS,
  CHURCH_RADIUS_PER_CLERGY,
  COAL_MAX_DISTANCE_TILES,
  COWBOY_MAX_HP,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_TRAIN_COST,
  COWBOY_TRAIN_TICKS,
  CYCLE_SECONDS,
  DAY_COUNT,
  DAY_PHASE_SECONDS,
  DEMOLISH_REFUND_FRACTION,
  Difficulty,
  DIFFICULTY_SETTINGS,
  DYNAMITER_MAX_HP,
  DYNAMITER_MAX_PER_BARRACKS,
  DYNAMITER_TRAIN_COST,
  DYNAMITER_TRAIN_TICKS,
  ENCLOSURE_RECOMPUTE_RADIUS_TILES,
  ENDLESS_THREAT_RAMP_CYCLES,
  ESCALATION_NET_WORTH_PER_TIER,
  GAME_DURATION_SECONDS,
  GRANARY_STORAGE_BONUS,
  GRAVEL_MAX_DISTANCE_TILES,
  HOUSE_TIER_HYSTERESIS_TICKS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MOUNTED_COWBOY_MAX_HP,
  MOUNTED_COWBOY_MAX_PER_HORSERY,
  MOUNTED_COWBOY_TRAIN_COST,
  MOUNTED_COWBOY_TRAIN_TICKS,
  PRODUCTION_STALL_NOTIFY_TICKS,
  REPAIR_COST_FRACTION,
  RunMode,
  STARTING_MONEY,
  THREAT_NET_WORTH_FULL,
  TRADING_POST_DEFAULT_AMOUNT,
  TRADING_POST_DEFAULT_THRESHOLD,
  VEGETATION_CLEAR_CACTUS_JUICE,
  VEGETATION_CLEAR_COST,
  VEGETATION_CLEAR_TREE_LOGS,
  WAREHOUSE_STORAGE_BONUS,
  WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES,
  WATER_TOWER_ASSIST_OFFSET_TILES,
  WATER_TOWER_IRRIGATION_RADIUS_TILES,
  WELL_MAX_WATER_DISTANCE_TILES,
  WELL_OUTPUT_BY_DISTANCE,
  CROP_OUTPUT_BY_DISTANCE,
  WANDERING_SETTLERS_MONEY_MIN,
  WANDERING_SETTLERS_MONEY_MAX,
  ROLLING_OBJECTIVE_SLOT_COUNT,
} from '../config/constants';
import {
  OBJECTIVE_DEFINITIONS,
  OBJECTIVE_DEFINITIONS_BY_ID,
  OBJECTIVE_TEMPLATES,
  ObjectiveDefinition,
  ObjectiveSnapshot,
  ObjectiveTemplateId,
  ObjectiveTemplateParams,
  formatObjectiveReward,
  generateObjectiveFromTemplate,
} from '../config/objectives';
import {
  AnimalKind,
  BRAWLER_TRAIN_MATERIALS,
  BUILDING_DEFINITIONS,
  BuildingType,
  DYNAMITER_TRAIN_MATERIALS,
  HOUSE_TIER_CONFIG,
  HarvestConfig,
  HouseTier,
  MarketableResourceKey,
  PlacedBuilding,
  RESOURCE_LABELS,
  RESOURCE_VALUES,
  ResourceKey,
  SALOON_SELL_RATES,
  SUPERMARKET_SELL_RATES,
  AutoSale,
  MARKET_STALL_SELL_RATES,
  TradeOrderConfig,
  TrainingQueueJob,
  UnitKind,
  WorkerPriority,
  getConstructionTicks,
  getUnitCount,
  getUnitHpArray,
  getWorkersRequired,
  setUnitCount,
} from '../config/buildingConfig';
import {
  TileType,
  distanceToNearestTileType,
  distanceToNearestWater,
  isBuildableTerrain,
  regenerateWorldTiles,
} from '../config/mapConfig';
import { VEGETATION_DEFINITIONS } from '../config/vegetationConfig';
import {
  countVegetationInRadius,
  findNearestVegetation,
  getVegetationAtTile,
  harvestVegetation,
  plantVegetation,
  removeVegetation,
  resetVegetation,
  VegetationEntity,
} from './vegetation';
import { gameEvents } from './gameEvents';
import { addNotification, clearNotifications } from './notifications';
import { getCurrentMarketPrice, recordMarketSaleVolume, resetMarket, runMarketTick } from './market';
import {
  getCattleDiseaseMultiplier,
  getDroughtWellMultiplier,
  getDustStormProductionMultiplier,
  getGoldRushMultiplier,
  resetWorldEvents,
  runWorldEventsTick,
} from './worldEvents';
import { resetRaiderCamps } from './raiderCamps';
import { EnclosureResult, EnclosureTileState, computeEnclosure, isEnclosureValid } from './enclosures';
import {
  TOWN_RANK_LABELS,
  TOWN_RANK_ORDER,
  TownRank,
  TownRankProgress,
  TownRankSnapshot,
  getRankForSnapshot,
  getRankProgress,
} from '../config/townRank';
import { computeLegacyEarned, earnLegacy, getActivePrestigeModifiers, recordTownFounded } from './prestige';

export interface Resources {
  rawMeat: number;
  meat: number;
  water: number;
  eggs: number;
  leather: number;
  clothes: number;
  logs: number;
  wood: number;
  potatoes: number;
  liquor: number;
  agaveJuice: number;
  stone: number;
  iron: number;
  tools: number;
  coal: number;
}

/**
 * Phase 49: one production tick's worth of a single resource's flow, kept in
 * a rolling `RESOURCE_HISTORY_LENGTH`-entry buffer per `ResourceKey` so the
 * Statistics panel can sparkline a trend instead of only ever showing the
 * current instant (`getResourceTrends`, Phase 33, only ever held the *last*
 * tick's net delta - a fine HUD readout, useless for "is this getting
 * better or worse"). `produced`/`consumed` are gross flow for that tick
 * (production outputs actually added to the pool, harvest yield, and
 * whatever Supermarket/Saloon sales or House needs actually drew out); `net`
 * mirrors `resourceTrends` for that same tick so the two never disagree.
 */
export interface ResourceHistoryEntry {
  produced: number;
  consumed: number;
  net: number;
}

/**
 * Phase 49: compact per-building productivity readout over a rolling window,
 * independent of `PlacedBuilding` itself (kept in a side Map, the same
 * pattern Phase 44's notification debounce state uses) so a building's shape
 * doesn't grow with every future stat someone wants to observe. `blockReason`
 * is only meaningful when the building is currently inactive - it's the
 * reason attached to the most recent inactive tick, using the same
 * destroyed -> understaffed -> upkeep unpaid -> no input/vegetation ->
 * running priority order Phase 35's `describeHarvestStatus` established.
 */
export interface BuildingProductivity {
  activeTicks: number;
  totalTicks: number;
  blockReason: string | null;
}

/**
 * Phase 32: the town is scored on what it's actually worth at the buzzer, not
 * on a single commodity it happened to produce. The breakdown is carried
 * alongside the total so the game-over screen can show where the value sits
 * (cash hoarded vs. banked vs. unsold stock vs. bricks and mortar).
 */
export interface NetWorthBreakdown {
  cash: number;
  banked: number;
  resources: number;
  buildings: number;
  total: number;
}

export interface GameOverSummary {
  netWorth: NetWorthBreakdown;
  totalMeatProduced: number;
  buildingCounts: Record<BuildingType, number>;
  /**
   * Phase 34: how the run ended. 'time' is the normal buzzer after DAY_COUNT
   * full day/night cycles; 'destroyed' is the new early defeat when raiders
   * level the last standing building.
   */
  reason: GameOverReason;
  daysSurvived: number;
  /**
   * Phase 64: the run's own settings and length, carried on the summary so
   * GameOverOverlay can look the result up in the persistent records store
   * (which is keyed per difficulty+mode) without having to reach back into
   * gameState for context that belongs to the run that just ended.
   */
  difficulty: Difficulty;
  mode: RunMode;
  elapsedSeconds: number;
  /** Phase 83: the town's final derived rank (see config/townRank.ts), shown on the game-over screen. */
  townRank: TownRank;
  /** Phase 84: legacy points just banked from this run ending (death or time-up) - see state/prestige.ts's computeLegacyEarned. Always >= 0; GameOverOverlay surfaces it alongside the net-worth/records display. */
  legacyEarned: number;
}

export type GameOverReason = 'time' | 'destroyed';

/** Phase 34: which half of the day/night cycle the run is currently in. */
export type DayPhase = 'day' | 'night';

export interface DayPhaseChange {
  dayNumber: number;
  phase: DayPhase;
}

function emptyResources(): Resources {
  return {
    rawMeat: 0,
    meat: 0,
    water: 0,
    eggs: 0,
    leather: 0,
    clothes: 0,
    logs: 0,
    wood: 0,
    potatoes: 0,
    liquor: 0,
    agaveJuice: 0,
    stone: 0,
    iron: 0,
    tools: 0,
    coal: 0,
  };
}

let money = STARTING_MONEY;
const resources: Resources = emptyResources();
/** Phase 33: per-resource change over the last completed tick, for the HUD's +X.X/tick trend readout. */
let resourceTrends: Resources = emptyResources();

/**
 * Phase 49: rolling per-resource produced/consumed/net history, capped at
 * `RESOURCE_HISTORY_LENGTH` entries (oldest dropped via `.shift()` - cheap at
 * this length, this runs once per 2s tick, not per frame). `tickResource*`
 * are the current tick's in-progress accumulators, written to by every place
 * in `runProductionTick`/`runSupermarketSales`/`runSaloonSales`/
 * `runHouseNeeds` that actually mutates a resource amount; they're pure
 * observation (`addProducedThisTick`/`addConsumedThisTick`), never read back
 * into a gameplay decision, and reset at the top of every `runProductionTick`.
 */
const RESOURCE_HISTORY_LENGTH = 60;
type ResourceHistoryBuffers = Record<ResourceKey, ResourceHistoryEntry[]>;
function emptyResourceHistoryBuffers(): ResourceHistoryBuffers {
  const buffers = {} as ResourceHistoryBuffers;
  for (const key of Object.keys(emptyResources()) as ResourceKey[]) {
    buffers[key] = [];
  }
  return buffers;
}
let resourceHistory: ResourceHistoryBuffers = emptyResourceHistoryBuffers();
let tickResourceProduced: Partial<Record<ResourceKey, number>> = {};
let tickResourceConsumed: Partial<Record<ResourceKey, number>> = {};

function addProducedThisTick(key: ResourceKey, amount: number): void {
  if (amount <= 0) {
    return;
  }
  tickResourceProduced[key] = (tickResourceProduced[key] ?? 0) + amount;
}

function addConsumedThisTick(key: ResourceKey, amount: number): void {
  if (amount <= 0) {
    return;
  }
  tickResourceConsumed[key] = (tickResourceConsumed[key] ?? 0) + amount;
}

/**
 * Phase 49: compact rolling active/inactive record per building, capped at
 * `PRODUCTIVITY_WINDOW_TICKS` booleans (oldest dropped). Kept in a side Map
 * keyed by buildingId - like Phase 44's `stalledInputTicks`/etc. - rather
 * than on `PlacedBuilding` itself, so this optional UI feature doesn't grow
 * every building record. Only buildings with a `production` or `harvest`
 * config are tracked (see `recordProductivityTick`'s call sites in
 * `runProductionTick`); everything else has no entry and
 * `getBuildingProductivity` returns null for it.
 */
const PRODUCTIVITY_WINDOW_TICKS = 20;
interface ProductivityRecord {
  window: boolean[];
  lastBlockReason: string | null;
}
const productivityRecords = new Map<string, ProductivityRecord>();

function recordProductivityTick(buildingId: string, active: boolean, blockReason: string | null): void {
  let record = productivityRecords.get(buildingId);
  if (!record) {
    record = { window: [], lastBlockReason: null };
    productivityRecords.set(buildingId, record);
  }
  record.window.push(active);
  if (record.window.length > PRODUCTIVITY_WINDOW_TICKS) {
    record.window.shift();
  }
  record.lastBlockReason = active ? null : blockReason;
}

const placedBuildings: PlacedBuilding[] = [];
const buildingsById = new Map<string, PlacedBuilding>();
const occupancy: (string | null)[][] = createEmptyOccupancy();
let totalMeatProduced = 0;
/**
 * Bug 2 fix: lifetime "ever placed" count per BuildingType, incremented in
 * placeBuilding() and never decremented on removal - unlike placedBuildings/
 * buildingsById (which drop a building's record the instant it's destroyed
 * or bulldozed), this survives a Town-Destroyed wipe so endGame's summary can
 * still report what was actually built during the run.
 */
let buildingsEverBuiltByType: Partial<Record<BuildingType, number>> = {};
/**
 * Phase 34: the clock is now elapsed-forward rather than a single countdown.
 * Everything else about the cycle (which day, which phase, how long is left in
 * it) is derived from this one number, so there is no way for the day counter
 * and the phase timer to drift apart.
 */
let elapsedSeconds = 0;
let gameOver = false;
let totalPopulation = 0;
/**
 * Phase 83: the town's current derived rank (see config/townRank.ts),
 * recomputed every production tick by runTownRankCheck. Starts at 'camp' -
 * TOWN_RANK_THRESHOLDS.camp is an empty requirement, matching a fresh
 * resetGame() town exactly, so this initial value is never actually wrong
 * even before the first tick runs.
 */
let currentTownRank: TownRank = 'camp';
/**
 * Phase 39: chosen on the pre-game (and post-game-over) difficulty/mode
 * picker and passed into resetGame; defaults reproduce the pre-Phase-39
 * behaviour exactly so nothing downstream needs a "was this ever set" check.
 */
let currentDifficulty: Difficulty = 'normal';
let currentRunMode: RunMode = 'fixed';
let employedPopulation = 0;
let idlePopulation = 0;
/**
 * Phase 42: town-wide "workers still needed if every priority-eligible
 * building were to be fully staffed" - computed once per assignWorkforce
 * pass alongside idlePopulation. Unlike idlePopulation (spare workers with no
 * job), this is jobs with no worker: the number the info panel and HUD show
 * so a player sees *why* a Normal/Low building is sitting empty rather than
 * just that it is.
 */
let laborShortfall = 0;

/**
 * Phase 44: debounce state for the notification log's three "recurring
 * condition" triggers (stalled inputs, upkeep-unpaid, storage-cap waste).
 * Each needs to fire once on the transition into the bad state and allow a
 * fresh notification only after a transition back out - never every tick
 * while the condition holds, which is what production-tick runs at 2s
 * cadence would otherwise spam the log with. Keyed by buildingId (or, for
 * storage waste, by ResourceKey - that condition is global to the resource
 * pool, not any one building) rather than stored on PlacedBuilding itself,
 * since nothing outside this debounce logic needs to read it.
 */
const stalledInputTicks = new Map<string, number>();
const stalledInputNotified = new Set<string>();
const upkeepDisabledNotified = new Set<string>();
const resourcesWastingAtCap = new Set<ResourceKey>();

function clearNotificationDebounceState(): void {
  stalledInputTicks.clear();
  stalledInputNotified.clear();
  upkeepDisabledNotified.clear();
  resourcesWastingAtCap.clear();
}

/**
 * Real Fence Enclosures: cached per-building flood-fill result (see
 * state/enclosures.ts's computeEnclosure), keyed by farm buildingId - like
 * productivityRecords above, this is recomputed on demand (never per-tick)
 * and dropped in removeBuilding/resetGame. Only farm-type buildings (an
 * `animal` config) ever get an entry; getEnclosureFor lazily computes and
 * caches on first read so a building that's never had a nearby Fence/Gate
 * change since placement still gets a correct (open) result the first time
 * anything asks.
 */
const enclosureCache = new Map<string, EnclosureResult>();

function isFarmBuilding(building: PlacedBuilding): boolean {
  return BUILDING_DEFINITIONS[building.type].animal !== undefined;
}

/**
 * The single tile-state predicate every enclosure computation feeds into
 * state/enclosures.ts's computeEnclosure - Fence blocks, Gate is a
 * counted-but-passable boundary tile, any other building blocks, everything
 * else is open. `selfBuildingId` is the farm this computation is FOR, not a
 * tile to exclude/pass through: a farm's own footprint must query as
 * 'building' (matching this file's and enclosures.ts's own documented
 * invariant "a farm's own footprint counts as occupied so the fill can't
 * walk back through it") so the flood-fill can't shortcut across the farm's
 * body. Bug fix: this used to early-return 'open' whenever
 * `occupantId === excludeBuildingId`, i.e. treated the farm as passable
 * ground through itself - a copy-paste of tileHasOtherBuilding's "exclude
 * self" pattern (used there to find ADJACENT roads, where skipping your own
 * tiles is correct) misapplied here, where the farm's own tiles must
 * self-block instead. Confirmed by direct repro: for a single rectangular
 * pen this rarely flips the closed/open verdict on its own (BFS can always
 * route around a convex footprint through the seeded boundary band instead
 * of through it), but it does inflate `enclosedTileCount` by the footprint's
 * own area every time, and that inflation can tip an otherwise-legitimate,
 * already-near-cap pen over MAX_FLOOD_FILL_TILES (see the raised cap below).
 */
function queryEnclosureTile(tileX: number, tileY: number, selfBuildingId: string): EnclosureTileState {
  const occupantId = tileY >= 0 && tileY < MAP_HEIGHT_TILES && tileX >= 0 && tileX < MAP_WIDTH_TILES ? occupancy[tileY][tileX] : null;
  if (!occupantId) {
    return 'open';
  }
  if (occupantId === selfBuildingId) {
    return 'building';
  }
  const occupant = buildingsById.get(occupantId);
  if (!occupant) {
    return 'open';
  }
  if (occupant.type === BuildingType.Fence || occupant.type === BuildingType.WoodenWall) {
    // Phase 68: WoodenWall is a boundary tile for the enclosure BFS exactly
    // like Fence - both are solid, non-passable perimeter segments (Gate
    // remains the only counted-but-passable one).
    return 'fence';
  }
  if (occupant.type === BuildingType.Gate) {
    return 'gate';
  }
  if (occupant.type === BuildingType.WoodenGate) {
    // Phase 69: a WoodenGate's classification tracks its live gateOpen state
    // - open behaves exactly like the legacy Gate (counted-but-passable
    // boundary), closed behaves exactly like a Fence/WoodenWall (solid
    // boundary the fill cannot walk through).
    return occupant.gateOpen === false ? 'fence' : 'gate';
  }
  return 'building';
}

function recomputeEnclosureFor(building: PlacedBuilding): EnclosureResult {
  const { width, height } = BUILDING_DEFINITIONS[building.type].size;
  const result = computeEnclosure(building.tileX, building.tileY, width, height, (x, y) =>
    queryEnclosureTile(x, y, building.id),
  );
  enclosureCache.set(building.id, result);
  return result;
}

/** Cached read - never runs the flood-fill itself. Lazily computes once if this farm has no cached entry yet (e.g. just placed). */
export function getEnclosureFor(buildingId: string): EnclosureResult | null {
  const building = buildingsById.get(buildingId);
  if (!building || !isFarmBuilding(building)) {
    return null;
  }
  const cached = enclosureCache.get(buildingId);
  if (cached) {
    return cached;
  }
  return recomputeEnclosureFor(building);
}

/**
 * Called whenever a Fence or Gate is placed/removed, and once for a
 * freshly-placed farm. Only farms within ENCLOSURE_RECOMPUTE_RADIUS_TILES
 * (Chebyshev, cheap) of the changed tile are recomputed - a wall edit on one
 * side of a large map cannot have changed a farm's enclosure clear across it,
 * so this avoids an O(all farms) flood-fill pass on every single Fence
 * click.
 */
function recomputeEnclosuresNear(tileX: number, tileY: number): void {
  for (const building of placedBuildings) {
    if (!isFarmBuilding(building)) {
      continue;
    }
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const dx = Math.max(building.tileX - tileX, 0, tileX - (building.tileX + width - 1));
    const dy = Math.max(building.tileY - tileY, 0, tileY - (building.tileY + height - 1));
    if (Math.max(dx, dy) <= ENCLOSURE_RECOMPUTE_RADIUS_TILES) {
      recomputeEnclosureFor(building);
    }
  }
}

/** Manual/forced recompute hook (e.g. a debug-overlay toggle or the info panel) - recomputes every currently-placed farm's enclosure, ignoring the radius optimization. Still only ever runs on demand, never per-tick. */
export function recomputeAllEnclosures(): void {
  for (const building of placedBuildings) {
    if (isFarmBuilding(building)) {
      recomputeEnclosureFor(building);
    }
  }
}

/** Required enclosed tile area to own `animalCount` animals of the given kind - see ANIMAL_ENCLOSURE_TILES_PER_ANIMAL's doc comment for the per-kind scale rationale. */
export function getRequiredEnclosureArea(animalLabel: AnimalKind, animalCount: number): number {
  return ANIMAL_ENCLOSURE_TILES_PER_ANIMAL[animalLabel] * animalCount;
}

function createEmptyOccupancy(): (string | null)[][] {
  const grid: (string | null)[][] = [];
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    grid.push(new Array(MAP_WIDTH_TILES).fill(null));
  }
  return grid;
}

export function getMoney(): number {
  return money;
}

/**
 * Phase 55: Wandering Settlers world event. An instant, one-shot money gift
 * with no lasting state - population is tier-summed from real Houses (Phase
 * 46), so a "free population" reward doesn't fit that model the way a flat
 * cash gift does. Called directly by MainScene's world-event timer rather
 * than routed through state/worldEvents.ts's startWorldEvent/activeEvent slot
 * (there is nothing to expire), returning the granted amount so the caller
 * can build its own notification/banner text, mirroring triggerMerchantDeal's
 * pattern in MainScene.
 */
export function applyWanderingSettlersReward(): number {
  const amount = Math.round(
    WANDERING_SETTLERS_MONEY_MIN + Math.random() * (WANDERING_SETTLERS_MONEY_MAX - WANDERING_SETTLERS_MONEY_MIN),
  );
  money = Math.round((money + amount) * 100) / 100;
  gameEvents.emit('money-changed', money);
  return amount;
}

export function getResources(): Readonly<Resources> {
  return resources;
}

export function getElapsedSeconds(): number {
  return elapsedSeconds;
}

/** Seconds left in the whole run (all DAY_COUNT cycles), floored at 0. */
export function getRemainingSeconds(): number {
  return Math.max(0, GAME_DURATION_SECONDS - elapsedSeconds);
}

/**
 * Pure derivation from an elapsed-seconds value, so the same function answers
 * "what phase is it now" and "what phase will it be in N seconds" (the raid
 * scheduler needs the latter to decide whether to bother showing a warning).
 */
export function getPhaseAtElapsed(seconds: number): DayPhase {
  return seconds % CYCLE_SECONDS < DAY_PHASE_SECONDS ? 'day' : 'night';
}

/**
 * Phase 39: fixed-mode keeps the original DAY_COUNT ceiling (a run is exactly
 * that many cycles, and the buzzer fires at the last one), but Endless mode
 * has no ceiling to cap against - the header just keeps counting up.
 */
export function getDayNumberAtElapsed(seconds: number): number {
  const day = Math.floor(seconds / CYCLE_SECONDS) + 1;
  return currentRunMode === 'fixed' ? Math.min(DAY_COUNT, day) : day;
}

export function getCurrentDifficulty(): Difficulty {
  return currentDifficulty;
}

export function getCurrentRunMode(): RunMode {
  return currentRunMode;
}

export function getDayPhase(): DayPhase {
  return getPhaseAtElapsed(elapsedSeconds);
}

export function getDayNumber(): number {
  return getDayNumberAtElapsed(elapsedSeconds);
}

/** Seconds left in the *current* day or night half, which is what the HUD counts down. */
export function getPhaseRemainingSeconds(): number {
  const intoCycle = elapsedSeconds % CYCLE_SECONDS;
  return getDayPhase() === 'day'
    ? DAY_PHASE_SECONDS - intoCycle
    : CYCLE_SECONDS - intoCycle;
}

export function getTotalMeatProduced(): number {
  return totalMeatProduced;
}

export function isGameOver(): boolean {
  return gameOver;
}

export function getTotalPopulation(): number {
  return totalPopulation;
}

export function getEmployedPopulation(): number {
  return employedPopulation;
}

export function getIdlePopulation(): number {
  return idlePopulation;
}

/** Phase 42: see the `laborShortfall` module variable's doc comment. */
export function getLaborShortfall(): number {
  return laborShortfall;
}

/**
 * Phase 47: which building types have already had their "New building
 * unlocked" notification fired, so a fluctuating population/net-worth (a
 * raid destroys a House, upkeep drains cash) doesn't re-fire the log entry
 * every time the requirement flickers back above/below the threshold.
 * Cleared on resetGame so a fresh run starts with a clean slate.
 */
const unlockNotified = new Set<BuildingType>();

/**
 * Phase 47: Milestone-Gated Building Unlocks. An undefined `unlockRequirement`
 * is always-unlocked; otherwise every present field must hold simultaneously.
 * Reads whichever of population/net-worth/day the requirement actually names,
 * so a building gated purely on `dayAtLeast` doesn't pay for a net-worth
 * computation it never asked for.
 */
export function isBuildingUnlocked(type: BuildingType): boolean {
  const requirement = BUILDING_DEFINITIONS[type].unlockRequirement;
  if (!requirement) {
    return true;
  }
  if (requirement.populationAtLeast !== undefined && totalPopulation < requirement.populationAtLeast) {
    return false;
  }
  if (requirement.dayAtLeast !== undefined && getDayNumber() < requirement.dayAtLeast) {
    return false;
  }
  if (requirement.netWorthAtLeast !== undefined && computeNetWorth().total < requirement.netWorthAtLeast) {
    return false;
  }
  return true;
}

/**
 * Player-facing "Unlocks at Population 10" / "Unlocks at Day 2, Net Worth
 * $2200" text for a locked building's tooltip - lists every unmet field, not
 * just the first, since a building can be gated on more than one axis
 * (Watchtower: day + population).
 */
export function describeUnlockRequirement(type: BuildingType): string | null {
  const requirement = BUILDING_DEFINITIONS[type].unlockRequirement;
  if (!requirement) {
    return null;
  }
  const parts: string[] = [];
  if (requirement.populationAtLeast !== undefined) {
    parts.push(`Population ${requirement.populationAtLeast}`);
  }
  if (requirement.dayAtLeast !== undefined) {
    parts.push(`Day ${requirement.dayAtLeast}`);
  }
  if (requirement.netWorthAtLeast !== undefined) {
    parts.push(`Net Worth $${requirement.netWorthAtLeast}`);
  }
  return `Unlocks at ${parts.join(', ')}`;
}

/**
 * Called from runProductionTick and placeBuilding - the two places population,
 * net worth or day can meaningfully change - rather than on a dedicated timer.
 * Fires an info-kind notification the moment a still-locked building's
 * requirement is first satisfied, then marks it so it never fires again this
 * run (see `unlockNotified`'s doc comment).
 */
function checkBuildingUnlocks(): void {
  for (const type of Object.values(BuildingType)) {
    if (unlockNotified.has(type) || !BUILDING_DEFINITIONS[type].unlockRequirement) {
      continue;
    }
    if (isBuildingUnlocked(type)) {
      unlockNotified.add(type);
      addNotification(`New building unlocked: ${BUILDING_DEFINITIONS[type].label}`, 'info', elapsedSeconds);
    }
  }
}

/**
 * Phase 56: Objectives / Quest Chain. A rolling ROLLING_OBJECTIVE_SLOT_COUNT-
 * wide active set drawn, in declaration order, from config/objectives.ts's
 * OBJECTIVE_DEFINITIONS (objectiveQueue holds the not-yet-active remainder).
 * Kept as small standalone module state - like Phase 44's notification
 * debounce Maps - rather than folded onto any PlacedBuilding, since an
 * objective is a town-wide goal, not a per-building one.
 */
interface ActiveObjectiveState {
  id: string;
  progress: number;
}
let activeObjectiveStates: ActiveObjectiveState[] = [];
let objectiveQueue: string[] = [];
const completedObjectiveIds = new Set<string>();

/**
 * Phase 81: Procedural Endless Objectives. Once the static objectiveQueue
 * (seeded from the 8 fixed OBJECTIVE_DEFINITIONS) runs dry - which it always
 * eventually does in Endless mode - refillActiveObjectives() generates a new
 * ObjectiveDefinition from a template instead of leaving the slot empty
 * forever. A generated definition's getProgress is a live closure, so it
 * can't be persisted directly (see GeneratedObjectiveRecord below); it's kept
 * here, in a runtime-only Map, and resolved through resolveObjectiveDefinition
 * rather than OBJECTIVE_DEFINITIONS_BY_ID directly.
 */
const generatedObjectiveDefinitions = new Map<string, ObjectiveDefinition>();

/**
 * Everything needed to rebuild one generated ObjectiveDefinition later - the
 * template id + the params picked at generation time + the difficulty index
 * used to scale it + the per-run sequence number baked into its id (so a
 * rebuilt definition's id is byte-for-byte identical to the original, not
 * just its target/reward). This, not the ObjectiveDefinition itself, is what
 * gets persisted (Decision 6) - see serializeObjectivesState/
 * restoreObjectivesState below.
 */
interface GeneratedObjectiveRecord {
  id: string;
  templateId: ObjectiveTemplateId;
  params: ObjectiveTemplateParams;
  difficultyIndex: number;
  generationSeq: number;
}
/** Keyed by generated id, so a currently-active OR still-queued generated objective's record can be looked up/persisted/rebuilt uniformly. */
const generatedObjectiveRecords = new Map<string, GeneratedObjectiveRecord>();
/** Monotonically increasing per-run counter guaranteeing a fresh generated id every call (Decision 1's "guaranteed-unique id" requirement) - never reset except by a full resetGame. */
let objectiveGenerationCounter = 0;

/**
 * The single resolver every objective-id lookup MUST go through (Decision 2).
 * Checks the runtime generated-objective map first, falls back to the 8
 * static hand-authored definitions second. Both runObjectivesCheck (progress/
 * completion) and getActiveObjectives (UI display) read exclusively through
 * this - a lookup that bypassed it for a generated id would silently stall
 * that objective forever (runObjectivesCheck) or show the raw id string
 * instead of a description (getActiveObjectives).
 */
function resolveObjectiveDefinition(id: string): ObjectiveDefinition | undefined {
  return generatedObjectiveDefinitions.get(id) ?? OBJECTIVE_DEFINITIONS_BY_ID.get(id);
}

/**
 * Picks one currently-available template (Decision 5: filtered against the
 * live snapshot so e.g. a "Ship Liquor" objective is never generated for a
 * town with no Liquor Still) at random, generates a concrete definition off
 * it via the shared template-building path, registers it into both runtime
 * maps, and returns its id. OBJECTIVE_TEMPLATES always includes at least one
 * universally-available template (net-worth), so this can never fail to
 * produce something.
 */
function generateNextObjectiveId(snapshot: ObjectiveSnapshot, difficultyIndex: number): string {
  const available = OBJECTIVE_TEMPLATES.filter((template) => template.isAvailable(snapshot));
  const pool = available.length > 0 ? available : OBJECTIVE_TEMPLATES;
  const template = pool[Math.floor(Math.random() * pool.length)];
  const params = template.pickParams(snapshot);
  const generationSeq = ++objectiveGenerationCounter;
  const definition = generateObjectiveFromTemplate(template.templateId, params, difficultyIndex, generationSeq);

  generatedObjectiveDefinitions.set(definition.id, definition);
  generatedObjectiveRecords.set(definition.id, {
    id: definition.id,
    templateId: template.templateId,
    params,
    difficultyIndex,
    generationSeq,
  });
  return definition.id;
}

/**
 * Run-lifetime total of each resource ever sold across Supermarket/Saloon/
 * Trading Post (Phases 14/27/51) - unlike the resource pool itself, this
 * never decrements, so a sale-driven objective ("Ship 50 Clothes") can't be
 * un-completed by later spending the stock back down. Written by the three
 * sell passes below, right alongside their existing recordMarketSaleVolume
 * call.
 */
let cumulativeResourcesSold: Partial<Record<ResourceKey, number>> = {};
function addSoldThisRun(key: ResourceKey, amount: number): void {
  if (amount <= 0) {
    return;
  }
  cumulativeResourcesSold[key] = (cumulativeResourcesSold[key] ?? 0) + amount;
}

/**
 * Cumulative Cowboy + Cowboy-on-Horse units ever completed out of a Phase 53
 * training queue - unlike cowboyCount/mountedCowboyCount (which decrement
 * when a unit dies, freeing its training slot), this only ever grows, so a
 * "Train N Cowboys" objective reflects total investment rather than current
 * garrison size.
 */
let totalUnitsTrained = 0;

/**
 * Survival objective tracking: cleared at the start of every night phase and
 * flipped true by removeBuilding's destroyed path if a building falls during
 * that same night; consulted at the following dawn (tickTimer) to grow
 * nightsSurvivedCleanCount only when it never did. Not required to be
 * consecutive nights - a running lifetime count of "nights that ended clean".
 */
let buildingLostThisNight = false;
let nightsSurvivedCleanCount = 0;

/** (Re)builds the queue fresh in declaration order and fills the first ROLLING_OBJECTIVE_SLOT_COUNT slots - called from resetGame, so every run starts on the same first three objectives. */
function initObjectiveQueue(): void {
  objectiveQueue = OBJECTIVE_DEFINITIONS.map((definition) => definition.id);
  activeObjectiveStates = [];
  completedObjectiveIds.clear();
  generatedObjectiveDefinitions.clear();
  generatedObjectiveRecords.clear();
  objectiveGenerationCounter = 0;
  refillActiveObjectives();
}

/**
 * Fills any empty rolling slot first from the static queue (unchanged
 * behavior), then, once that's exhausted, generates a fresh objective from a
 * template (Decision 3: lazily, one at a time, exactly when a slot actually
 * needs filling - never pre-generated in bulk). Decision 4: the generator's
 * difficulty index is the current completed-objective count, so objectives
 * generated later in a long run scale up.
 */
function refillActiveObjectives(): void {
  while (activeObjectiveStates.length < ROLLING_OBJECTIVE_SLOT_COUNT) {
    const queuedId = objectiveQueue.shift();
    if (queuedId) {
      activeObjectiveStates.push({ id: queuedId, progress: 0 });
      continue;
    }
    const snapshot = buildObjectiveSnapshot();
    const difficultyIndex = completedObjectiveIds.size;
    const generatedId = generateNextObjectiveId(snapshot, difficultyIndex);
    activeObjectiveStates.push({ id: generatedId, progress: 0 });
  }
}

function buildObjectiveSnapshot(): ObjectiveSnapshot {
  return {
    cumulativeSold: cumulativeResourcesSold,
    totalPopulation,
    netWorthTotal: computeNetWorth().total,
    watchtowerCount: placedBuildings.filter((building) => building.type === BuildingType.Watchtower).length,
    totalUnitsTrained,
    nightsSurvivedCleanCount,
    buildingsEverBuiltByType: { ...buildingsEverBuiltByType },
  };
}

/**
 * Called at the end of runProductionTick, after checkBuildingUnlocks (same
 * "recompute against current town state every tick" shape). A definition
 * whose progress reaches its target grants its reward immediately - money
 * added directly, materials added straight to the resource pool bypassing
 * the storage cap, since this is a quest payout rather than production
 * output that should be able to overflow/waste - logs a Phase 44
 * notification, and is replaced by the next queued objective (if any remain)
 * in the same tick so the rolling slot count never sits short for a tick.
 */
function runObjectivesCheck(): void {
  if (activeObjectiveStates.length === 0) {
    return;
  }

  const snapshot = buildObjectiveSnapshot();
  const stillActive: ActiveObjectiveState[] = [];
  let materialsGranted = false;

  for (const state of activeObjectiveStates) {
    const definition = resolveObjectiveDefinition(state.id);
    if (!definition) {
      continue;
    }
    const progress = Math.min(definition.target, Math.max(0, definition.getProgress(snapshot)));
    state.progress = progress;

    if (progress < definition.target) {
      stillActive.push(state);
      continue;
    }

    completedObjectiveIds.add(definition.id);
    if (definition.reward.money) {
      money = Math.round((money + definition.reward.money) * 100) / 100;
    }
    if (definition.reward.materials) {
      for (const [key, amount] of Object.entries(definition.reward.materials) as [ResourceKey, number][]) {
        resources[key] += amount;
      }
      materialsGranted = true;
    }
    addNotification(
      `Objective complete: ${definition.description} -> ${formatObjectiveReward(definition.reward)}`,
      'info',
      elapsedSeconds,
    );
    // A completed generated objective is done for good - drop its runtime
    // definition/record so the generated-objective maps don't grow unbounded
    // over a very long Endless run (the static definitions have no
    // equivalent cleanup need, since they're a fixed 8-entry table).
    generatedObjectiveDefinitions.delete(definition.id);
    generatedObjectiveRecords.delete(definition.id);
  }

  activeObjectiveStates = stillActive;
  refillActiveObjectives();

  if (materialsGranted) {
    gameEvents.emit('resources-changed', { ...resources });
  }
}

export interface ObjectiveView {
  id: string;
  description: string;
  progress: number;
  target: number;
  unit?: string;
}

/** UI-ready view of the current rolling objective set, for ObjectivesPanel. */
export function getActiveObjectives(): ObjectiveView[] {
  return activeObjectiveStates.map((state) => {
    const definition = resolveObjectiveDefinition(state.id);
    return {
      id: state.id,
      description: definition?.description ?? state.id,
      progress: state.progress,
      target: definition?.target ?? 0,
      unit: definition?.unit,
    };
  });
}

/**
 * Phase 83: Town Rank Ladder. Builds a fresh TownRankSnapshot from values
 * gameState already tracks/exposes elsewhere - net worth, day number, live
 * population, lifetime completed-objective count - so config/townRank.ts
 * never has to import gameState itself (matching objectives.ts's own
 * buildObjectiveSnapshot pattern one section up).
 */
function buildTownRankSnapshot(): TownRankSnapshot {
  return {
    netWorth: computeNetWorth().total,
    daysSurvived: getDayNumber(),
    totalPopulation,
    completedObjectives: getCompletedObjectiveCount(),
  };
}

export function getTownRank(): TownRank {
  return getRankForSnapshot(buildTownRankSnapshot());
}

export function getTownRankProgress(): TownRankProgress {
  return getRankProgress(buildTownRankSnapshot());
}

/**
 * Called at the end of runProductionTick (after runObjectivesCheck, since a
 * completed objective this same tick can be exactly what pushes the town
 * over a rank threshold). Mirrors runHouseNeeds' before/after comparison for
 * detecting a house-tier change: no separate debounce Set is needed because
 * comparing currentTownRank (the last-known value) against a freshly derived
 * rank can only ever report a genuine crossing, and it can only ever fire
 * once per crossing since currentTownRank is updated immediately after.
 */
function runTownRankCheck(): void {
  const nextRank = getRankForSnapshot(buildTownRankSnapshot());
  if (nextRank === currentTownRank) {
    return;
  }
  const previousRank = currentTownRank;
  currentTownRank = nextRank;

  const previousIndex = TOWN_RANK_ORDER.indexOf(previousRank);
  const nextIndex = TOWN_RANK_ORDER.indexOf(nextRank);
  if (nextIndex > previousIndex) {
    gameEvents.emit('town-rank-changed', { rank: nextRank, previousRank });
    addNotification(
      `The town has grown into a ${TOWN_RANK_LABELS[nextRank]}!`,
      'info',
      elapsedSeconds,
    );
  } else {
    // Ranks are derived fresh every tick from live, non-monotonic inputs (net
    // worth can fall, population can shrink after a raid) - a downgrade is
    // possible and is still a real state change worth the event, just not
    // worth a congratulatory notification.
    gameEvents.emit('town-rank-changed', { rank: nextRank, previousRank });
  }
}

export function getCompletedObjectiveCount(): number {
  return completedObjectiveIds.size;
}

/**
 * Phase 81: the persisted shape of one generated objective - template id +
 * params + difficulty index + the generation sequence baked into its id
 * (Decision 6). NOT the ObjectiveDefinition itself (its getProgress is a
 * closure that can't survive JSON.stringify) - restoreObjectivesState below
 * feeds this straight back into generateObjectiveFromTemplate to rebuild a
 * byte-for-byte-equivalent definition, including a working getProgress.
 */
export interface GeneratedObjectiveSaveEntry {
  id: string;
  templateId: ObjectiveTemplateId;
  params: ObjectiveTemplateParams;
  difficultyIndex: number;
  generationSeq: number;
}

/**
 * Phase 56 persistence payload (Phase 52's save/load). Optional on the save
 * type itself (see persistence.ts) so a pre-Phase-56 save still loads fine -
 * resetGame's own initObjectiveQueue already seeded a fresh rolling set, and
 * this simply overwrites it when the field is present.
 *
 * Phase 81: `generatedObjectives` is optional on THIS interface too - an
 * ObjectiveSaveState produced before this phase shipped has no such field at
 * all (only the 8 static objectives existed then), and restoreObjectivesState
 * below must treat that as "no generated objectives were active", not throw.
 */
export interface ObjectiveSaveState {
  activeObjectiveStates: { id: string; progress: number }[];
  objectiveQueue: string[];
  completedObjectiveIds: string[];
  cumulativeResourcesSold: Partial<Record<ResourceKey, number>>;
  totalUnitsTrained: number;
  nightsSurvivedCleanCount: number;
  generatedObjectives?: GeneratedObjectiveSaveEntry[];
  objectiveGenerationCounter?: number;
}

export function serializeObjectivesState(): ObjectiveSaveState {
  // Every currently-ACTIVE objective id that resolves through the generated
  // map (rather than the static OBJECTIVE_DEFINITIONS_BY_ID) needs its
  // record persisted - objectiveQueue itself never holds generated ids (see
  // refillActiveObjectives: a generated objective is created and pushed
  // straight into activeObjectiveStates in the same call, never queued), so
  // scanning activeObjectiveStates alone is sufficient.
  const generatedObjectives: GeneratedObjectiveSaveEntry[] = [];
  for (const state of activeObjectiveStates) {
    const record = generatedObjectiveRecords.get(state.id);
    if (record) {
      generatedObjectives.push({ ...record, params: { ...record.params } });
    }
  }

  return {
    activeObjectiveStates: activeObjectiveStates.map((state) => ({ ...state })),
    objectiveQueue: [...objectiveQueue],
    completedObjectiveIds: Array.from(completedObjectiveIds),
    cumulativeResourcesSold: { ...cumulativeResourcesSold },
    totalUnitsTrained,
    nightsSurvivedCleanCount,
    generatedObjectives,
    objectiveGenerationCounter,
  };
}

export function restoreObjectivesState(state: ObjectiveSaveState): void {
  activeObjectiveStates = state.activeObjectiveStates.map((entry) => ({ ...entry }));
  objectiveQueue = [...state.objectiveQueue];
  completedObjectiveIds.clear();
  for (const id of state.completedObjectiveIds) {
    completedObjectiveIds.add(id);
  }
  cumulativeResourcesSold = { ...state.cumulativeResourcesSold };
  totalUnitsTrained = state.totalUnitsTrained;
  nightsSurvivedCleanCount = state.nightsSurvivedCleanCount;

  // Phase 81: rebuild the runtime generated-objective map from the persisted
  // template id + params + difficulty index for each entry - an old save
  // (predating this phase) simply has `generatedObjectives` undefined, which
  // degrades to "no generated objectives were active" rather than crashing.
  generatedObjectiveDefinitions.clear();
  generatedObjectiveRecords.clear();
  for (const entry of state.generatedObjectives ?? []) {
    const definition = generateObjectiveFromTemplate(
      entry.templateId,
      entry.params,
      entry.difficultyIndex,
      entry.generationSeq,
    );
    generatedObjectiveDefinitions.set(definition.id, definition);
    generatedObjectiveRecords.set(definition.id, { ...entry, params: { ...entry.params } });
  }
  objectiveGenerationCounter = state.objectiveGenerationCounter ?? objectiveGenerationCounter;
}

export function isWithinBounds(tileX: number, tileY: number, type: BuildingType): boolean {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  return (
    tileX >= 0 &&
    tileY >= 0 &&
    tileX + width <= MAP_WIDTH_TILES &&
    tileY + height <= MAP_HEIGHT_TILES
  );
}

export function isAreaFree(tileX: number, tileY: number, type: BuildingType): boolean {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      if (occupancy[y][x] !== null) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Phase 37: does the global resource pool hold at least `materials` for this
 * building type? Money-only definitions (no `materials` field) always pass.
 */
export function hasEnoughMaterials(type: BuildingType): boolean {
  const { materials } = BUILDING_DEFINITIONS[type];
  if (!materials) {
    return true;
  }
  return (Object.entries(materials) as [ResourceKey, number][]).every(
    ([key, amount]) => resources[key] >= amount,
  );
}

/** Player-facing "$X + Y Wood (have Z)" listing of whichever materials are still short, for the placement-rejection text. */
function describeMissingMaterials(type: BuildingType): string {
  const { materials } = BUILDING_DEFINITIONS[type];
  if (!materials) {
    return '';
  }
  return (Object.entries(materials) as [ResourceKey, number][])
    .filter(([key, amount]) => resources[key] < amount)
    .map(([key, amount]) => `${amount} ${RESOURCE_LABELS[key]} (have ${Math.floor(resources[key] * 10) / 10})`)
    .join(', ');
}

export function canAfford(type: BuildingType): boolean {
  return money >= BUILDING_DEFINITIONS[type].cost && hasEnoughMaterials(type);
}

/**
 * Phase 30: terrain is finally consulted. Every tile of the footprint must be
 * in-bounds and dry land (water is impassable).
 *
 * Item 1 (2026-09-07): vegetation is deliberately NOT checked here anymore.
 * A tree/cactus on the footprint used to be a hard block ("Blocked by
 * vegetation"), forcing a separate manual bulldozer-clear step before the
 * tile could be built on at all. It's now auto-cleared as part of the
 * placement transaction itself (see getVegetationClearCost/placeBuilding) -
 * water remains the one genuine terrain hard-block, since there is no
 * "auto-clear water" equivalent.
 */
export function isTerrainBuildable(tileX: number, tileY: number, type: BuildingType): boolean {
  return getTerrainRejection(tileX, tileY, type) === null;
}

function getTerrainRejection(tileX: number, tileY: number, type: BuildingType): string | null {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      if (!isBuildableTerrain(x, y)) {
        return 'Cannot build on water';
      }
    }
  }
  return null;
}

/**
 * Item 1 (2026-09-07): Auto-clear vegetation on building placement. Placing
 * ANY building on a vegetated tile now clears the tree(s)/cactus/cacti in its
 * footprint automatically as part of the placement transaction, rather than
 * blocking placement until the player manually bulldozes each tile first
 * (VEGETATION_CLEAR_COST's original manual-clear path, clearVegetationAt,
 * still exists unchanged for clearing a tile with no building going on it -
 * e.g. to free up a tile for a harvester elsewhere, or just tidy an area).
 *
 * Design decision (cost): charges the SAME per-tile VEGETATION_CLEAR_COST/
 * refund the manual bulldozer path already uses, folded additively into the
 * placement's money cost, rather than making auto-clear free. A free
 * auto-clear would undercut the existing vegetation-clearing economy outright
 * (nobody would ever use the manual bulldozer-clear button again, and
 * "build a cheap 1x1 Road/Fence on top of an expensive tree, refund excluded"
 * would become a degenerate way to clear vegetation for less than its real
 * cost). Charging the same rate keeps clearing-via-building and
 * clearing-via-bulldozer equivalent in cost - placement is simply a
 * convenience that folds the two actions (clear + build) into one click and
 * one transaction, not a discount.
 *
 * Returns the vegetation entities the footprint currently covers plus the
 * total money cost/refund of auto-clearing all of them - shared by
 * getPlacementRejection (afford check + rejection text), getPlacementWarning
 * (soft advisory) and placeBuilding (the actual atomic clear-then-place).
 */
function getVegetationClearPlan(
  tileX: number,
  tileY: number,
  type: BuildingType,
): { entities: VegetationEntity[]; totalCost: number } {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  const entities: VegetationEntity[] = [];
  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      const entity = getVegetationAtTile(x, y);
      if (entity) {
        entities.push(entity);
      }
    }
  }
  return { entities, totalCost: entities.length * VEGETATION_CLEAR_COST };
}

/**
 * Phase 30: a Well needs groundwater. Placement is hard-gated on being within
 * WELL_MAX_WATER_DISTANCE_TILES of open water, and the same distance then
 * scales its output every tick (see wellOutputMultiplier), so the gate and
 * the payoff can never drift apart.
 */
export function getWellWaterDistance(tileX: number, tileY: number, type: BuildingType): number | null {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  return distanceToNearestWater(tileX, tileY, width, height, WELL_MAX_WATER_DISTANCE_TILES);
}

function wellOutputMultiplier(building: PlacedBuilding): number {
  const distance = getWellWaterDistance(building.tileX, building.tileY, building.type);
  if (distance === null) {
    return 0;
  }
  return WELL_OUTPUT_BY_DISTANCE[Math.min(distance, WELL_OUTPUT_BY_DISTANCE.length - 1)];
}

/**
 * Phase 50: Quarry/Iron Mine need Gravel underfoot or nearby, the same
 * hard-placement-gate shape as getWellWaterDistance above, just against
 * TileType.Gravel via the now-generalized distanceToNearestTileType. Unlike
 * a Well, output doesn't scale with this distance - it's a pass/fail gate
 * only, so there is no equivalent of wellOutputMultiplier here.
 */
export function getGravelDistance(tileX: number, tileY: number, type: BuildingType): number | null {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  return distanceToNearestTileType(TileType.Gravel, tileX, tileY, width, height, GRAVEL_MAX_DISTANCE_TILES);
}

/**
 * Phase 67: Coal Mine's placement gate, cloning getGravelDistance's shape
 * exactly but against TileType.Rock and the tighter COAL_MAX_DISTANCE_TILES -
 * Rock is a scarcer, more tightly-clustered terrain than Gravel, so Coal is
 * meant to be the harder-to-site of the two raw-extraction gates.
 */
export function getRockDistance(tileX: number, tileY: number, type: BuildingType): number | null {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  return distanceToNearestTileType(TileType.Rock, tileX, tileY, width, height, COAL_MAX_DISTANCE_TILES);
}

/**
 * Phase 54: Chebyshev tile distance from a footprint's center to the nearest
 * staffed, enabled Water Tower within WATER_TOWER_IRRIGATION_RADIUS_TILES, or
 * null when none is in range. Only an actually-running tower counts (hp>0,
 * not upkeep-disabled, staffed) - the same "active" gate Well output and
 * Watchtower fire already use - so a tower going idle (destroyed/unstaffed/
 * unpaid) drops any PotatoField relying on it back to its raw water distance
 * the very next tick, exactly like every other staffing-gated effect here.
 */
export function getNearestStaffedWaterTowerDistance(
  tileX: number,
  tileY: number,
  type: BuildingType,
): number | null {
  const center = getHarvestCenterTile(tileX, tileY, type);
  let best: number | null = null;
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.WaterTower) {
      continue;
    }
    if (building.hp <= 0 || building.disabled || !building.staffed) {
      continue;
    }
    const towerCenter = getHarvestCenterTile(building.tileX, building.tileY, building.type);
    const distance = Math.max(
      Math.abs(center.tileX - towerCenter.tileX),
      Math.abs(center.tileY - towerCenter.tileY),
    );
    if (distance > WATER_TOWER_IRRIGATION_RADIUS_TILES) {
      continue;
    }
    if (best === null || distance < best) {
      best = distance;
    }
  }
  return best;
}

/**
 * Phase 70: a Church's service radius grows with hired clergy, capped once
 * both slots are full. Nuns and Priests contribute the same per-head radius
 * bonus (CHURCH_RADIUS_PER_CLERGY) - the differentiator between the two
 * hires is Priest's extra tax bonus, applied in runHouseNeeds, not a
 * different radius contribution here.
 */
export function getChurchRadius(church: PlacedBuilding): number {
  const clergyCount = Math.min((church.nunCount ?? 0) + (church.priestCount ?? 0), CHURCH_MAX_CLERGY);
  return CHURCH_BASE_RADIUS_TILES + clergyCount * CHURCH_RADIUS_PER_CLERGY;
}

/**
 * Phase 70: whether `house` currently sits within a qualifying Church's
 * service radius - clones getNearestStaffedWaterTowerDistance's shape
 * exactly (only a live, staffed, enabled Church counts, so a raided or
 * upkeep-disabled Church stops serving the instant it goes down, same tick).
 * Returns a boolean rather than a distance since runHouseNeeds only ever
 * needs the pass/fail answer; the info panel's own distance readout is a
 * separate, informational-only query (see BuildingInfoPanel's Church status
 * line) built the same way.
 */
export function isServedByChurch(house: PlacedBuilding): boolean {
  const houseCenter = getHarvestCenterTile(house.tileX, house.tileY, house.type);
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Church) {
      continue;
    }
    if (building.hp <= 0 || building.disabled || !building.staffed) {
      continue;
    }
    const churchCenter = getHarvestCenterTile(building.tileX, building.tileY, building.type);
    const distance = Math.max(
      Math.abs(houseCenter.tileX - churchCenter.tileX),
      Math.abs(houseCenter.tileY - churchCenter.tileY),
    );
    if (distance <= getChurchRadius(building)) {
      return true;
    }
  }
  return false;
}

/**
 * Phase 70: the nearest qualifying Church's distance (or null if unserved) -
 * purely informational, backing the House info panel's "Church N tiles away"
 * status line. Mirrors isServedByChurch's own staffed/enabled/hp gate.
 */
export function getNearestChurchDistance(house: PlacedBuilding): number | null {
  const houseCenter = getHarvestCenterTile(house.tileX, house.tileY, house.type);
  let best: number | null = null;
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Church) {
      continue;
    }
    if (building.hp <= 0 || building.disabled || !building.staffed) {
      continue;
    }
    const churchCenter = getHarvestCenterTile(building.tileX, building.tileY, building.type);
    const distance = Math.max(
      Math.abs(houseCenter.tileX - churchCenter.tileX),
      Math.abs(houseCenter.tileY - churchCenter.tileY),
    );
    if (distance > getChurchRadius(building)) {
      continue;
    }
    if (best === null || distance < best) {
      best = distance;
    }
  }
  return best;
}

/**
 * Phase 70: how many Priests, across every qualifying Church currently
 * covering `house`, contribute to its tax bonus - a House inside the overlap
 * of two staffed Churches with Priests gets credit from both, matching
 * isServedByChurch's own any-qualifying-Church-counts logic rather than only
 * ever crediting the single nearest one.
 */
function countServingPriests(house: PlacedBuilding): number {
  const houseCenter = getHarvestCenterTile(house.tileX, house.tileY, house.type);
  let total = 0;
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Church) {
      continue;
    }
    if (building.hp <= 0 || building.disabled || !building.staffed) {
      continue;
    }
    const priestCount = building.priestCount ?? 0;
    if (priestCount <= 0) {
      continue;
    }
    const churchCenter = getHarvestCenterTile(building.tileX, building.tileY, building.type);
    const distance = Math.max(
      Math.abs(houseCenter.tileX - churchCenter.tileX),
      Math.abs(houseCenter.tileY - churchCenter.tileY),
    );
    if (distance <= getChurchRadius(building)) {
      total += priestCount;
    }
  }
  return total;
}

/**
 * Phase 54: a water-dependent crop's (PotatoField) effective distance to
 * water. Unlike getWellWaterDistance this is never a hard placement gate -
 * null just means "dry" - and the raw distanceToNearestWater search (bounded
 * to WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES) is floored against any
 * in-range staffed Water Tower's assist: `distanceToTower +
 * WATER_TOWER_ASSIST_OFFSET_TILES` stands in as a virtual water distance, so
 * a field beside a tower reads as nearly-at-the-water-line even when the
 * nearest real water tile is out of CROP_OUTPUT_BY_DISTANCE's range entirely.
 */
export function getCropWaterDistance(tileX: number, tileY: number, type: BuildingType): number | null {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  const actualDistance = distanceToNearestWater(
    tileX,
    tileY,
    width,
    height,
    WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES,
  );
  const towerDistance = getNearestStaffedWaterTowerDistance(tileX, tileY, type);
  const assistedDistance = towerDistance === null ? null : towerDistance + WATER_TOWER_ASSIST_OFFSET_TILES;
  if (actualDistance === null) {
    return assistedDistance;
  }
  if (assistedDistance === null) {
    return actualDistance;
  }
  return Math.min(actualDistance, assistedDistance);
}

/**
 * CROP_OUTPUT_BY_DISTANCE lookup keyed off getCropWaterDistance, 0 once that
 * returns null (out of range even with tower assist) - same null-means-0
 * shape as wellOutputMultiplier. Exported so both runProductionTick and the
 * placement preview/info panel share one source of truth for the multiplier.
 */
export function getCropOutputMultiplier(tileX: number, tileY: number, type: BuildingType): number {
  const distance = getCropWaterDistance(tileX, tileY, type);
  if (distance === null) {
    return 0;
  }
  return CROP_OUTPUT_BY_DISTANCE[Math.min(distance, CROP_OUTPUT_BY_DISTANCE.length - 1)];
}

/**
 * Phase 30: the single source of truth for "why can't I put this here",
 * returning a player-facing reason string (or null when placement is legal).
 * canPlaceBuilding is now a thin boolean wrapper over it so the preview
 * tint and the actual placement rule can never disagree.
 */
export function getPlacementRejection(tileX: number, tileY: number, type: BuildingType): string | null {
  // Phase 47: locked buildings are rejected before any of the map/afford
  // checks below - a locked-but-otherwise-legal tile shouldn't surface a
  // misleading "not enough money" reason instead of the real one.
  if (!isBuildingUnlocked(type)) {
    return describeUnlockRequirement(type) ?? 'Locked';
  }
  if (!isWithinBounds(tileX, tileY, type)) {
    return 'Outside the map';
  }
  const terrainRejection = getTerrainRejection(tileX, tileY, type);
  if (terrainRejection) {
    return terrainRejection;
  }
  if (!isAreaFree(tileX, tileY, type)) {
    return 'Tile already occupied';
  }
  if (type === BuildingType.Well && getWellWaterDistance(tileX, tileY, type) === null) {
    return `Well must be within ${WELL_MAX_WATER_DISTANCE_TILES} tiles of water`;
  }
  // Phase 54: Water Tower reuses the exact Well hard-gate - it relays an
  // existing water source rather than conjuring one, so it needs the same
  // proximity to real water a Well does.
  if (type === BuildingType.WaterTower && getWellWaterDistance(tileX, tileY, type) === null) {
    return `Water Tower must be within ${WELL_MAX_WATER_DISTANCE_TILES} tiles of water`;
  }
  if (
    (type === BuildingType.Quarry || type === BuildingType.IronMine) &&
    getGravelDistance(tileX, tileY, type) === null
  ) {
    return `${BUILDING_DEFINITIONS[type].label} must be on or within ${GRAVEL_MAX_DISTANCE_TILES} tiles of Gravel`;
  }
  if (type === BuildingType.CoalMine && getRockDistance(tileX, tileY, type) === null) {
    return `Coal Mine must be built on or within ${COAL_MAX_DISTANCE_TILES} tiles of Rock`;
  }
  // Item 1: the affordability check accounts for the total auto-clear cost
  // (vegetation tiles in the footprint x VEGETATION_CLEAR_COST) ALONGSIDE the
  // building's own money cost, in one combined threshold - not two separate
  // checks - so a player who can afford the building but not the clearing
  // (or vice versa) gets one accurate "not enough money" figure rather than
  // two contradictory-looking messages on subsequent reads.
  const clearPlan = getVegetationClearPlan(tileX, tileY, type);
  const totalMoneyNeeded = BUILDING_DEFINITIONS[type].cost + clearPlan.totalCost;
  if (money < totalMoneyNeeded) {
    return clearPlan.totalCost > 0
      ? `Not enough money ($${totalMoneyNeeded}, includes $${clearPlan.totalCost} to clear ${clearPlan.entities.length} vegetation)`
      : `Not enough money ($${totalMoneyNeeded})`;
  }
  if (!hasEnoughMaterials(type)) {
    return `Not enough materials: need ${describeMissingMaterials(type)}`;
  }
  return null;
}

export function canPlaceBuilding(tileX: number, tileY: number, type: BuildingType): boolean {
  return getPlacementRejection(tileX, tileY, type) === null;
}

/**
 * The tile a harvesting building measures its radius from. Shared by
 * runHarvest and the info panel/placement preview so "what the building can
 * actually reach" and "what the UI says it can reach" are the same query -
 * they were previously two different code paths, and only one of them existed.
 */
export function getHarvestCenterTile(
  tileX: number,
  tileY: number,
  type: BuildingType,
): { tileX: number; tileY: number } {
  const { width, height } = BUILDING_DEFINITIONS[type].size;
  return { tileX: tileX + Math.floor(width / 2), tileY: tileY + Math.floor(height / 2) };
}

/**
 * Phase 34: a *soft* advisory shown alongside a legal placement, not a
 * rejection. Placing a Forestry or Cactus Milker on a bald plain is allowed
 * (vegetation regrows, and a player may be planning ahead), but doing it
 * blind used to be one of the most common ways to waste 60-150 dollars with
 * no feedback whatsoever - the building simply never produced and the info
 * panel misreported why (see BuildingInfoPanel's harvest status).
 */
export function getPlacementWarning(tileX: number, tileY: number, type: BuildingType): string | null {
  const { harvest } = BUILDING_DEFINITIONS[type];
  if (harvest) {
    const center = getHarvestCenterTile(tileX, tileY, type);
    const count = countVegetationInRadius(harvest.kind, center.tileX, center.tileY, harvest.radiusTiles);
    const { label, pluralLabel } = VEGETATION_DEFINITIONS[harvest.kind];
    if (count === 0) {
      return `No ${pluralLabel} in range - this will produce nothing here`;
    }
    if (count <= 2) {
      return `Only ${count} ${count === 1 ? label : pluralLabel} in range`;
    }
    return null;
  }

  // Phase 54: same soft-advisory shape as the harvest warning above, for the
  // other kind of "legal to place, but you probably don't want to yet"
  // building - a water-dependent crop far from water (and no Water Tower
  // assist) still places fine, it just won't produce much.
  if (type === BuildingType.PotatoField) {
    const multiplier = getCropOutputMultiplier(tileX, tileY, type);
    if (multiplier === 0) {
      return 'Too far from water - this Potato Field will produce nothing here';
    }
    if (multiplier < 1) {
      return `Far from water - output reduced to ${Math.round(multiplier * 100)}%`;
    }
  }

  // Item 1 (2026-09-07): a vegetated footprint is legal to build on (it gets
  // auto-cleared as part of placement, see getVegetationClearPlan/
  // placeBuilding) but the player should still see the cost coming before
  // they commit to the click - this is advisory only, the tint stays green.
  const clearPlan = getVegetationClearPlan(tileX, tileY, type);
  if (clearPlan.entities.length > 0) {
    return `Will clear ${clearPlan.entities.length} vegetation for $${clearPlan.totalCost}`;
  }

  return null;
}

export function placeBuilding(tileX: number, tileY: number, type: BuildingType): PlacedBuilding | null {
  if (!canPlaceBuilding(tileX, tileY, type)) {
    return null;
  }

  const definition = BUILDING_DEFINITIONS[type];
  const { width, height } = definition.size;

  // Item 1 (2026-09-07): re-derive the clear plan rather than trusting a
  // caller-passed value - canPlaceBuilding above already re-validated total
  // affordability (building cost + clear cost) against the CURRENT money
  // balance at the top of this call, so this recomputation can't disagree
  // with what was just approved. Vegetation is cleared and money/resources
  // deducted for it BEFORE the building's own cost/materials deduction below,
  // atomically within this one function call - nothing async, nothing that
  // could observe a half-applied state.
  const clearPlan = getVegetationClearPlan(tileX, tileY, type);
  if (clearPlan.entities.length > 0) {
    money = Math.round((money - clearPlan.totalCost) * 100) / 100;
    const storageCap = getStorageCap();
    for (const entity of clearPlan.entities) {
      if (entity.kind === 'Tree') {
        resources.logs = Math.min(storageCap, resources.logs + VEGETATION_CLEAR_TREE_LOGS);
      } else {
        resources.agaveJuice = Math.min(storageCap, resources.agaveJuice + VEGETATION_CLEAR_CACTUS_JUICE);
      }
      // removeVegetation emits 'vegetation-removed' itself - the same event
      // the manual bulldozer-clear path (clearVegetationAt) already relies on
      // for MainScene to destroy the tile's sprite/update the minimap, so
      // this auto-clear path stays visually in sync for free.
      removeVegetation(entity);
    }
    gameEvents.emit('resources-changed', { ...resources });
  }

  const building: PlacedBuilding = {
    id: `${type}-${tileX}-${tileY}-${Date.now()}`,
    type,
    tileX,
    tileY,
    active: false,
    connected: false,
    assignedWorkers: 0,
    staffed: false,
    animalCount: 0,
    hp: definition.maxHp,
    cowboyCount: 0,
    cowboyHp: [],
    mountedCowboyCount: 0,
    mountedCowboyHp: [],
    brawlerCount: 0,
    brawlerHp: [],
    dynamiterCount: 0,
    dynamiterHp: [],
    bankBalance: 0,
    disabled: false,
    priority: 'normal',
    houseTier: 1,
    houseNeedsMetStreak: 0,
    houseNeedsUnmetStreak: 0,
    houseNeedsStatus: [],
    tradeOrders: {},
    trainingQueue: [],
    gateOpen: type === BuildingType.WoodenGate ? true : undefined,
    ladyCount: type === BuildingType.Brothel ? 0 : undefined,
    constructionTicksRemaining: getConstructionTicks(type),
  };

  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      occupancy[y][x] = building.id;
    }
  }

  money -= definition.cost;
  if (definition.materials) {
    for (const [key, amount] of Object.entries(definition.materials) as [ResourceKey, number][]) {
      resources[key] -= amount;
    }
  }
  placedBuildings.push(building);
  buildingsById.set(building.id, building);
  buildingsEverBuiltByType[type] = (buildingsEverBuiltByType[type] ?? 0) + 1;

  // Bug fix (2026-09-07): this recompute used to run AFTER the
  // 'building-placed' emit below, and was narrowly gated on the placed
  // building being a Fence/Gate itself. Both were wrong. (1) Ordering: emit()
  // on gameEvents (a plain synchronous Phaser.Events.EventEmitter) runs every
  // listener - including MainScene's enclosure-exit-hint redraw - INSIDE this
  // call, before the cache below was refreshed, so a listener reacting to the
  // very fence tile that closes a pen would see the stale pre-closure result.
  // (2) Trigger scope: queryEnclosureTile (above) treats ANY other building's
  // footprint as a blocker, not just Fence/Gate - exactly per this system's
  // documented "a building's own footprint counts as occupied" invariant -
  // but the old trigger only ever recomputed nearby farms for a Fence/Gate
  // placement, so a plain building (House, Well, another farm, ...) placed to
  // plug the last gap in an existing farm's perimeter never invalidated that
  // farm's cache at all: getEnclosureFor kept returning the last-cached
  // (often "open") result indefinitely, until some unrelated later Fence/Gate
  // edit nearby happened to force a fresh flood-fill. Confirmed via a
  // real-code-path repro (placeBuilding -> recomputeEnclosuresNear ->
  // enclosureCache -> getEnclosureFor, no reimplementation) that a
  // fence-and-building-mixed pen read closed=false from the cache while a
  // forced recomputeAllEnclosures() on the exact same state read closed=true.
  // Fix: recompute BEFORE emitting 'building-placed', and do it for every
  // placement, not just Fence/Gate - any building can be the piece that
  // closes (or breaches) a neighboring farm's perimeter.
  if (isFarmBuilding(building)) {
    recomputeEnclosureFor(building);
  }
  recomputeEnclosuresNear(tileX, tileY);

  gameEvents.emit('money-changed', money);
  if (definition.materials) {
    gameEvents.emit('resources-changed', { ...resources });
  }
  gameEvents.emit('building-placed', building);

  updateConnections();
  checkBuildingUnlocks();

  return building;
}

/**
 * Phase 52: the load-time counterpart to placeBuilding - pushes an
 * already-fully-formed PlacedBuilding (deserialized from a save) straight
 * into occupancy/placedBuildings/buildingsById, skipping every affordability/
 * placement-legality check placeBuilding runs (the building already exists,
 * legally, in the save) and skipping the cost deduction and
 * 'building-placed'/'money-changed' events a fresh purchase fires. Bounds are
 * still clamped defensively against the *current* map size in case a future
 * map-size change ever ships against an older save.
 */
export function restoreBuilding(building: PlacedBuilding): void {
  const { width, height } = BUILDING_DEFINITIONS[building.type].size;
  for (let y = building.tileY; y < building.tileY + height; y++) {
    for (let x = building.tileX; x < building.tileX + width; x++) {
      if (y >= 0 && y < MAP_HEIGHT_TILES && x >= 0 && x < MAP_WIDTH_TILES) {
        occupancy[y][x] = building.id;
      }
    }
  }
  placedBuildings.push(building);
  buildingsById.set(building.id, building);
}

/**
 * Phase 52: exposed so persistence's post-load hydration can force an
 * immediate staffing pass - without this, population/employed/staffed would
 * all read as 0 until the next PRODUCTION_TICK_MS tick fires, which is a
 * visibly wrong HUD for up to 2s right after a load.
 */
export function recomputeWorkforceNow(): void {
  assignWorkforce();
}

/**
 * Phase 52: called once right after a save finishes restoring its buildings,
 * before the run resumes ticking. A freshly-hydrated town can already have
 * satisfied unlock requirements the previous session unlocked; without this,
 * the very next checkBuildingUnlocks() (from the next production tick) would
 * treat every already-unlocked building as newly unlocked and spam the
 * notification log with things the player unlocked minutes/hours ago.
 * Silently marks them notified instead, with no notification emitted.
 */
export function silentlySyncUnlockNotifications(): void {
  for (const type of Object.values(BuildingType)) {
    if (isBuildingUnlocked(type)) {
      unlockNotified.add(type);
    }
  }
}

/**
 * Phase 52: restores the handful of scalar/pool fields a save carries that
 * resetGame() otherwise (re)initializes to fresh-game defaults - called right
 * after resetGame() so the fresh-game values it just set are immediately
 * overwritten with the loaded ones. `resources` keeps its existing object
 * identity (Object.assign, matching resetGame's own pattern) rather than
 * being replaced, in case anything ever held a reference to it.
 */
export function restoreCoreState(state: {
  money: number;
  resources: Resources;
  elapsedSeconds: number;
  totalMeatProduced: number;
}): void {
  money = state.money;
  Object.assign(resources, state.resources);
  elapsedSeconds = state.elapsedSeconds;
  totalMeatProduced = state.totalMeatProduced;
}

/** Bug 2 fix: read-only snapshot for persistence's serializeGameState - a fresh copy so a save payload never aliases the live counter object. */
export function getBuildingsEverBuiltByType(): Partial<Record<BuildingType, number>> {
  return { ...buildingsEverBuiltByType };
}

/**
 * Bug 2 fix: the load-time counterpart to getBuildingsEverBuiltByType - see
 * persistence.ts's deserializeGameState for the backward-compat fallback used
 * when an older save doesn't carry this field.
 */
export function restoreBuildingsEverBuiltByType(counts: Partial<Record<BuildingType, number>>): void {
  buildingsEverBuiltByType = { ...counts };
}

/**
 * Phase 31: the one and only way a building leaves the world, shared by
 * raider destruction (0 HP) and the player's bulldozer. Everything hanging
 * off the building goes with it: its occupancy tiles are freed, its livestock
 * and garrisoned units cease to exist (their counts/HP arrays die with the
 * record), and road connectivity is recomputed for the survivors.
 *
 * Workforce is deliberately NOT recomputed here - assignWorkforce already
 * rebuilds it from scratch every tick against the current building list, so
 * the freed workers are reassigned on the very next tick with no stale state.
 *
 * The building is removed from state immediately rather than after any
 * animation: gameState stays the single source of truth, and the scene plays
 * its destruction animation on the now-orphaned sprite (see
 * MainScene.playDestructionAnimation) before destroying it.
 */
function removeBuilding(building: PlacedBuilding, reason: 'destroyed' | 'demolished'): void {
  const { width, height } = BUILDING_DEFINITIONS[building.type].size;
  for (let y = building.tileY; y < building.tileY + height; y++) {
    for (let x = building.tileX; x < building.tileX + width; x++) {
      if (occupancy[y]?.[x] === building.id) {
        occupancy[y][x] = null;
      }
    }
  }

  const index = placedBuildings.indexOf(building);
  if (index >= 0) {
    placedBuildings.splice(index, 1);
  }
  buildingsById.delete(building.id);

  // Phase 44: drop any per-building debounce state along with the building
  // itself, so a destroyed-then-rebuilt-with-a-new-id building starts fresh
  // rather than inheriting a stale stalled/notified flag from a record that
  // no longer exists.
  stalledInputTicks.delete(building.id);
  stalledInputNotified.delete(building.id);
  upkeepDisabledNotified.delete(building.id);
  // Phase 49: same reasoning - a destroyed-then-rebuilt building starts its
  // productivity window fresh under its new id rather than inheriting one.
  productivityRecords.delete(building.id);
  // Real Fence Enclosures: drop the removed building's own cached enclosure
  // (only meaningful if it was itself a farm) and recompute every nearby
  // farm's enclosure - occupancy for this tile is already cleared above, so
  // the recompute sees the gap immediately. Bug fix (2026-09-07): this used
  // to only fire for a removed Fence/Gate, mirroring placeBuilding's old
  // narrow trigger - but queryEnclosureTile treats ANY building's footprint
  // as a blocker, so removing/bulldozing a plain building that had been
  // plugging a gap in a neighboring farm's perimeter (e.g. a demolished
  // House that used to close one side of the pen) must invalidate that
  // farm's cache too, not just a removed wall segment. See placeBuilding's
  // matching fix for the full root-cause writeup.
  enclosureCache.delete(building.id);
  recomputeEnclosuresNear(building.tileX, building.tileY);

  if (reason === 'destroyed') {
    addNotification(
      `${BUILDING_DEFINITIONS[building.type].label} was destroyed by raiders!`,
      'danger',
      elapsedSeconds,
      building.id,
    );
    // Phase 56: "Survive N Nights Without Losing a Building" objective - only
    // a raid-destroyed loss during the night phase counts against it; the
    // flag is read (and reset for the next night) by tickTimer at dawn.
    if (getDayPhase() === 'night') {
      buildingLostThisNight = true;
    }
  }

  gameEvents.emit('building-removed', { building, reason });
  updateConnections();

  // Phase 34: losing your last building to a raid ends the run early. Gated
  // on reason === 'destroyed' deliberately: bulldozing your own last shed is
  // a legitimate (if odd) rebuild step, not a defeat, and the town has all
  // its money and stock to rebuild with. Raiders levelling everything is the
  // actual failure state.
  if (reason === 'destroyed' && placedBuildings.length === 0) {
    endGame('destroyed');
  }
}

/**
 * Phase 34: the player-initiated counterpart to depletion-driven removal.
 * Before this, removeVegetation was only ever reached by a harvester draining
 * an entity to zero, which meant a tree sitting on the one tile you needed was
 * an unresolvable dead end unless you happened to want a Forestry there.
 * Costs cash and hands back a little of what was felled.
 */
export function clearVegetationAt(tileX: number, tileY: number): boolean {
  const entity = getVegetationAtTile(tileX, tileY);
  if (!entity || money < VEGETATION_CLEAR_COST) {
    return false;
  }

  money = Math.round((money - VEGETATION_CLEAR_COST) * 100) / 100;
  const storageCap = getStorageCap();
  if (entity.kind === 'Tree') {
    resources.logs = Math.min(storageCap, resources.logs + VEGETATION_CLEAR_TREE_LOGS);
  } else {
    resources.agaveJuice = Math.min(storageCap, resources.agaveJuice + VEGETATION_CLEAR_CACTUS_JUICE);
  }

  removeVegetation(entity);

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });

  return true;
}

/** Called by the combat tick once a building's HP has been driven to 0. */
export function destroyBuilding(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building) {
    return false;
  }
  removeBuilding(building, 'destroyed');
  return true;
}

/**
 * Player-initiated teardown. Refunds DEMOLISH_REFUND_FRACTION of the build
 * cost (raider destruction refunds nothing - that's the whole point of
 * defending) and otherwise runs the identical removal path.
 */
export function demolishBuilding(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building) {
    return false;
  }

  const refund = Math.round(BUILDING_DEFINITIONS[building.type].cost * DEMOLISH_REFUND_FRACTION * 100) / 100;
  money = Math.round((money + refund) * 100) / 100;
  removeBuilding(building, 'demolished');
  gameEvents.emit('money-changed', money);

  return true;
}

/**
 * Phase 31: with per-tick auto-regen gone, HP only comes back by paying for
 * it. Cost is pro-rated by the fraction of HP missing against a fixed share
 * of the build cost, so patching light scratches is cheap and rebuilding a
 * near-wreck approaches half its original price.
 */
export function getRepairCost(building: PlacedBuilding): number {
  const definition = BUILDING_DEFINITIONS[building.type];
  const missing = Math.max(0, definition.maxHp - building.hp);
  if (missing === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil((missing / definition.maxHp) * definition.cost * REPAIR_COST_FRACTION));
}

export function repairBuilding(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building) {
    return false;
  }

  const definition = BUILDING_DEFINITIONS[building.type];
  const cost = getRepairCost(building);
  if (cost === 0 || money < cost) {
    return false;
  }

  money = Math.round((money - cost) * 100) / 100;
  building.hp = definition.maxHp;

  gameEvents.emit('money-changed', money);
  gameEvents.emit('building-repaired', building);

  return true;
}

/**
 * Phase 31: units are mortal. Damage is written into the training building's
 * parallel HP array (gameState stays the source of truth for HP, exactly as
 * it already is for building.hp), and the dead unit's *slot is kept* at 0
 * rather than spliced out: MainScene's CombatUnit.index is aligned to that
 * slot, and every other living unit's index would shift if the array
 * collapsed. Only the count is decremented, which is what the per-building
 * training cap reads - so a lost cowboy frees a slot to train a replacement.
 */
export function damageUnit(buildingId: string, kind: UnitKind, index: number, amount: number): number {
  const building = buildingsById.get(buildingId);
  if (!building) {
    return 0;
  }

  const hpArray = getUnitHpArray(building, kind);
  if (index < 0 || index >= hpArray.length || hpArray[index] <= 0) {
    return 0;
  }

  hpArray[index] = Math.max(0, hpArray[index] - amount);
  if (hpArray[index] === 0) {
    setUnitCount(building, kind, Math.max(0, getUnitCount(building, kind) - 1));
  }

  return hpArray[index];
}

function tileHasOtherBuilding(x: number, y: number, excludeId: string): boolean {
  if (x < 0 || y < 0 || x >= MAP_WIDTH_TILES || y >= MAP_HEIGHT_TILES) {
    return false;
  }
  const id = occupancy[y][x];
  return id !== null && id !== excludeId;
}

function orthogonalNeighbors(tileX: number, tileY: number): [number, number][] {
  return [
    [tileX, tileY - 1],
    [tileX, tileY + 1],
    [tileX - 1, tileY],
    [tileX + 1, tileY],
  ];
}

function collectAdjacentRoadIds(building: PlacedBuilding): Set<string> {
  const { width, height } = BUILDING_DEFINITIONS[building.type].size;
  const roadIds = new Set<string>();

  const addIfRoad = (nx: number, ny: number) => {
    if (!tileHasOtherBuilding(nx, ny, building.id)) {
      return;
    }
    const neighbor = buildingsById.get(occupancy[ny][nx]!);
    if (neighbor?.type === BuildingType.Road) {
      roadIds.add(neighbor.id);
    }
  };

  for (let x = building.tileX; x < building.tileX + width; x++) {
    addIfRoad(x, building.tileY - 1);
    addIfRoad(x, building.tileY + height);
  }
  for (let y = building.tileY; y < building.tileY + height; y++) {
    addIfRoad(building.tileX - 1, y);
    addIfRoad(building.tileX + width, y);
  }

  return roadIds;
}

/**
 * Real Fence Enclosures: whether `building` (a farm) currently qualifies to
 * buy its NEXT animal - reads the cached enclosure (getEnclosureFor, never
 * re-runs the flood-fill here) and checks it's closed and has enough
 * enclosed floor area for animalCount + 1 of this farm's animal kind. Exported
 * so BuildingInfoPanel can build its disabled-reason text from the same two
 * sub-checks buyAnimal itself gates on.
 *
 * Item 4 (2026-09-07): Gate presence/count was dropped from this check
 * (isEnclosureValid no longer looks at gateCount) - see enclosures.ts's
 * isEnclosureValid doc comment for the rationale.
 */
export function getEnclosureBuyStatus(building: PlacedBuilding): {
  enclosure: EnclosureResult | null;
  valid: boolean;
  requiredArea: number;
} {
  const animalConfig = BUILDING_DEFINITIONS[building.type].animal;
  const enclosure = getEnclosureFor(building.id);
  if (!animalConfig || !enclosure) {
    return { enclosure, valid: false, requiredArea: 0 };
  }
  const requiredArea = getRequiredEnclosureArea(animalConfig.animalLabel, building.animalCount + 1);
  const valid = isEnclosureValid(enclosure) && enclosure.enclosedTileCount >= requiredArea;
  return { enclosure, valid, requiredArea };
}

/**
 * Buying an animal is a hard buy-gate, not a soft output multiplier: it
 * fails outright (no partial/half-output fallback) without a closed Fence
 * perimeter big enough to hold animalCount + 1 animals, at the per-building
 * animal cap, or without enough money. (Gate count is no longer part of this
 * gate as of Item 4, 2026-09-07 - see isEnclosureValid.)
 */
export function buyAnimal(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building) {
    return false;
  }

  const animalConfig = BUILDING_DEFINITIONS[building.type].animal;
  if (!animalConfig) {
    return false;
  }
  if (building.animalCount >= animalConfig.maxAnimals) {
    return false;
  }
  if (!getEnclosureBuyStatus(building).valid) {
    return false;
  }
  if (money < animalConfig.costPerAnimal) {
    return false;
  }

  money -= animalConfig.costPerAnimal;
  building.animalCount += 1;

  gameEvents.emit('money-changed', money);
  gameEvents.emit('animal-bought', building);

  return true;
}

/**
 * Phase 53: training a Cowboy is still a hard buy-gate like buyAnimal (no
 * Fence requirement - that rule is animal-specific), but no longer spawns the
 * unit instantly: this only enqueues a TrainingQueueJob (deducting money
 * immediately, matching every other buy-gate's "pay on click" convention) and
 * runTrainingQueues below is what actually spawns it once the job's
 * remainingTicks reaches 0. The per-Barracks cap counts cowboyCount PLUS
 * everything already queued, since a queued job is a committed unit slot even
 * before it exists. Not gated on staffing - staffing only gates production,
 * and a Barracks has none of its own (the queue's own progress gate lives in
 * runTrainingQueues instead, since staffing can change while a job is
 * in-flight).
 */
export function trainCowboy(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Barracks) {
    return false;
  }
  if (building.hp <= 0) {
    return false;
  }
  if (building.cowboyCount + building.trainingQueue.length >= COWBOY_MAX_PER_BARRACKS) {
    return false;
  }
  if (money < COWBOY_TRAIN_COST) {
    return false;
  }

  money -= COWBOY_TRAIN_COST;
  building.trainingQueue.push({ kind: 'cowboy', remainingTicks: COWBOY_TRAIN_TICKS });

  gameEvents.emit('money-changed', money);

  return true;
}

/** Mirrors trainCowboy exactly, gated on Horsery/mountedCowboyCount/MOUNTED_COWBOY_MAX_PER_HORSERY instead of Barracks/cowboyCount/COWBOY_MAX_PER_BARRACKS. */
export function trainMountedCowboy(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Horsery) {
    return false;
  }
  if (building.hp <= 0) {
    return false;
  }
  if (building.mountedCowboyCount + building.trainingQueue.length >= MOUNTED_COWBOY_MAX_PER_HORSERY) {
    return false;
  }
  if (money < MOUNTED_COWBOY_TRAIN_COST) {
    return false;
  }

  money -= MOUNTED_COWBOY_TRAIN_COST;
  building.trainingQueue.push({ kind: 'cowboyOnHorse', remainingTicks: MOUNTED_COWBOY_TRAIN_TICKS });

  gameEvents.emit('money-changed', money);

  return true;
}

/**
 * Phase 70: hiring clergy is instant - unlike trainCowboy/trainMountedCowboy,
 * a Nun/Priest has no HP/garrison slot and isn't a combat unit, so there is
 * no training queue job to enqueue; the hire takes effect the moment it's
 * paid for, immediately widening the Church's service radius (and, for a
 * Priest, its tax bonus) on the very next runHouseNeeds pass.
 */
export function hireNun(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Church) {
    return false;
  }
  if (building.hp <= 0 || building.disabled) {
    return false;
  }
  if ((building.nunCount ?? 0) + (building.priestCount ?? 0) >= CHURCH_MAX_CLERGY) {
    return false;
  }
  if (money < CHURCH_NUN_COST) {
    return false;
  }

  money = Math.round((money - CHURCH_NUN_COST) * 100) / 100;
  building.nunCount = (building.nunCount ?? 0) + 1;

  gameEvents.emit('money-changed', money);

  return true;
}

/** Mirrors hireNun exactly, gated on CHURCH_PRIEST_COST/priestCount instead - see PlacedBuilding.priestCount's doc comment for the Nun-vs-Priest tradeoff. */
export function hirePriest(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Church) {
    return false;
  }
  if (building.hp <= 0 || building.disabled) {
    return false;
  }
  if ((building.nunCount ?? 0) + (building.priestCount ?? 0) >= CHURCH_MAX_CLERGY) {
    return false;
  }
  if (money < CHURCH_PRIEST_COST) {
    return false;
  }

  money = Math.round((money - CHURCH_PRIEST_COST) * 100) / 100;
  building.priestCount = (building.priestCount ?? 0) + 1;

  gameEvents.emit('money-changed', money);

  return true;
}

/**
 * Phase 72: hiring a lady is instant, exactly like hireNun/hirePriest above -
 * no HP, no training queue, no garrison sprite of her own. Effect takes hold
 * on the very next runBrothelIncome pass.
 */
export function hireLady(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Brothel) {
    return false;
  }
  if (building.hp <= 0 || building.disabled) {
    return false;
  }
  if ((building.ladyCount ?? 0) >= BROTHEL_MAX_LADIES) {
    return false;
  }
  if (money < BROTHEL_LADY_COST) {
    return false;
  }

  money = Math.round((money - BROTHEL_LADY_COST) * 100) / 100;
  building.ladyCount = (building.ladyCount ?? 0) + 1;

  gameEvents.emit('money-changed', money);

  return true;
}

/** Returns false (without deducting anything) the moment any single required material falls short - all-or-nothing, matching placeBuilding's own materials gate. */
function hasEnoughResourcesFor(materials: Partial<Record<ResourceKey, number>>): boolean {
  return (Object.entries(materials) as [ResourceKey, number][]).every(([key, amount]) => resources[key] >= amount);
}

function deductResources(materials: Partial<Record<ResourceKey, number>>): void {
  for (const [key, amount] of Object.entries(materials) as [ResourceKey, number][]) {
    resources[key] -= amount;
  }
}

/**
 * Phase 58: Brawler training - same hard buy-gate shape as trainCowboy, but
 * (per the phase spec's "cost accordingly (money + Phase 37 materials)")
 * also gated on and deducting BRAWLER_TRAIN_MATERIALS alongside the money
 * cost, both taken immediately at enqueue time like placeBuilding's own
 * materials deduction.
 */
export function trainBrawler(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Barracks) {
    return false;
  }
  if (building.hp <= 0) {
    return false;
  }
  if (building.brawlerCount + building.trainingQueue.length >= BRAWLER_MAX_PER_BARRACKS) {
    return false;
  }
  if (money < BRAWLER_TRAIN_COST || !hasEnoughResourcesFor(BRAWLER_TRAIN_MATERIALS)) {
    return false;
  }

  money -= BRAWLER_TRAIN_COST;
  deductResources(BRAWLER_TRAIN_MATERIALS);
  building.trainingQueue.push({ kind: 'brawler', remainingTicks: BRAWLER_TRAIN_TICKS });

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });

  return true;
}

/** Mirrors trainBrawler exactly, gated on DYNAMITER_MAX_PER_BARRACKS/DYNAMITER_TRAIN_COST/DYNAMITER_TRAIN_MATERIALS instead. */
export function trainDynamiter(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Barracks) {
    return false;
  }
  if (building.hp <= 0) {
    return false;
  }
  if (building.dynamiterCount + building.trainingQueue.length >= DYNAMITER_MAX_PER_BARRACKS) {
    return false;
  }
  if (money < DYNAMITER_TRAIN_COST || !hasEnoughResourcesFor(DYNAMITER_TRAIN_MATERIALS)) {
    return false;
  }

  money -= DYNAMITER_TRAIN_COST;
  deductResources(DYNAMITER_TRAIN_MATERIALS);
  building.trainingQueue.push({ kind: 'dynamiter', remainingTicks: DYNAMITER_TRAIN_TICKS });

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });

  return true;
}

/**
 * Phase 53: ticks every Barracks/Horsery's training queue once per production
 * tick. Only the job at the FRONT of a building's queue counts down - a
 * classic one-at-a-time training queue, so a job's `remainingTicks` in the
 * UI only moves once every job ahead of it has finished - gated the same way
 * a requiresWorkers building's own production would be (destroyed/
 * understaffed/upkeep-unpaid all simply pause progress rather than losing the
 * job or refunding it). A completed job spawns the unit exactly as
 * trainCowboy/trainMountedCowboy used to do inline before this phase (bump
 * the count, push starting HP, fire the matching '*-trained' event MainScene
 * already listens to for the visual) - only the timing moved, not the spawn
 * shape. Phase 58: generalized from a two-way if/else to a switch over all
 * four UnitKinds via getUnitHpArray/setUnitCount - a single Barracks' queue
 * can now mix cowboy/brawler/dynamiter jobs.
 */
function runTrainingQueues(): void {
  for (const building of placedBuildings) {
    if (building.trainingQueue.length === 0) {
      continue;
    }
    if (building.hp <= 0 || !building.staffed || building.disabled) {
      continue;
    }

    const job: TrainingQueueJob = building.trainingQueue[0];
    job.remainingTicks -= 1;
    if (job.remainingTicks > 0) {
      continue;
    }

    building.trainingQueue.shift();
    // Phase 56: counted here (job completion), not at trainCowboy/
    // trainMountedCowboy's enqueue time - a cancelled/never-finished queue
    // slot (there is no cancel path today, but this is the correct point
    // regardless) shouldn't count toward the "Train N Cowboys" objective.
    totalUnitsTrained += 1;
    setUnitCount(building, job.kind, getUnitCount(building, job.kind) + 1);
    switch (job.kind) {
      case 'cowboy':
        building.cowboyHp.push(COWBOY_MAX_HP);
        gameEvents.emit('cowboy-trained', building);
        break;
      case 'cowboyOnHorse':
        building.mountedCowboyHp.push(MOUNTED_COWBOY_MAX_HP);
        gameEvents.emit('mounted-cowboy-trained', building);
        break;
      case 'brawler':
        building.brawlerHp.push(BRAWLER_MAX_HP);
        gameEvents.emit('brawler-trained', building);
        break;
      case 'dynamiter':
        building.dynamiterHp.push(DYNAMITER_MAX_HP);
        gameEvents.emit('dynamiter-trained', building);
        break;
    }
  }
}

/**
 * Phase 53: player-set rally point for a Barracks/Horsery, consumed by
 * MainScene's spawn handlers to walk a freshly-trained unit straight there
 * instead of leaving it standing at its spawn slot. Gated to the two
 * building types that can ever train anything - setting one on any other
 * building would be silently meaningless.
 */
export function setRallyPoint(buildingId: string, worldX: number, worldY: number): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || (building.type !== BuildingType.Barracks && building.type !== BuildingType.Horsery)) {
    return false;
  }
  building.rallyPoint = { x: worldX, y: worldY };
  gameEvents.emit('rally-point-changed', building);
  return true;
}

/** Mirrors setRallyPoint's gate, just clearing the field instead of setting it. */
export function clearRallyPoint(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || (building.type !== BuildingType.Barracks && building.type !== BuildingType.Horsery)) {
    return false;
  }
  if (!building.rallyPoint) {
    return false;
  }
  building.rallyPoint = undefined;
  gameEvents.emit('rally-point-changed', building);
  return true;
}

/**
 * Phase 69: Wooden Gates. A gate's open/closed state is a THIRD way a tile's
 * wall/gate status can change at runtime (alongside placing/removing a
 * Fence/Gate/WoodenWall, which placeBuilding/removeBuilding already handle -
 * see their own doc comments on the 2026-09-07 "Enclosure Cache Invalidation
 * Fix"), so this follows the exact same discipline those two fixes
 * established: recompute nearby farms' cached enclosure BEFORE emitting the
 * change event, not after. gameEvents.emit is a synchronous
 * Phaser.Events.EventEmitter - every listener (MainScene's sprite-texture
 * swap, the enclosure-exit-hint redraw, BuildingInfoPanel's re-render) runs
 * INLINE, before this function returns, so a listener reacting to the exact
 * tile that just opened/closed a pen must see the freshly-recomputed result,
 * not a one-recompute-stale cache entry.
 */
export function setGateOpen(buildingId: string, open: boolean): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.WoodenGate) {
    return false;
  }
  building.gateOpen = open;
  recomputeEnclosuresNear(building.tileX, building.tileY);
  gameEvents.emit('gate-state-changed', building);
  return true;
}

/**
 * Batch version of setGateOpen for the "close/open all gates" control - one
 * call per WoodenGate rather than skipping the recompute to save time.
 * recomputeEnclosuresNear is already bounded to ENCLOSURE_RECOMPUTE_RADIUS_TILES
 * around a single changed tile (not a full-map rescan), so this stays cheap
 * even with several gates toggled in one call; correctness (never serving a
 * stale enclosure cache after a batch toggle) matters far more here than the
 * small, bounded extra cost of not deduplicating overlapping recompute radii.
 */
export function setAllGates(open: boolean): void {
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.WoodenGate) {
      continue;
    }
    building.gateOpen = open;
    recomputeEnclosuresNear(building.tileX, building.tileY);
    gameEvents.emit('gate-state-changed', building);
  }
}

/**
 * Deposit/withdraw are a bidirectional pair of the same hard buy-gate shape
 * as buyAnimal/trainCowboy: fixed $50 increment, blocked on wrong building
 * type, a disabled (0 HP) Bank, or insufficient funds on the source side of
 * the move (player money for deposit, bankBalance for withdraw).
 */
export function depositToBank(buildingId: string, amount: number = BANK_TRANSACTION_AMOUNT): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Bank) {
    return false;
  }
  if (building.hp <= 0) {
    return false;
  }
  if (money < amount) {
    return false;
  }

  money = Math.round((money - amount) * 100) / 100;
  building.bankBalance = Math.round((building.bankBalance + amount) * 100) / 100;

  gameEvents.emit('money-changed', money);
  gameEvents.emit('bank-changed', building);

  return true;
}

/** Mirrors depositToBank in the opposite direction; same hp/type gate, amount checked against bankBalance instead of money. */
export function withdrawFromBank(buildingId: string, amount: number = BANK_TRANSACTION_AMOUNT): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Bank) {
    return false;
  }
  if (building.hp <= 0) {
    return false;
  }
  if (building.bankBalance < amount) {
    return false;
  }

  building.bankBalance = Math.round((building.bankBalance - amount) * 100) / 100;
  money = Math.round((money + amount) * 100) / 100;

  gameEvents.emit('money-changed', money);
  gameEvents.emit('bank-changed', building);

  return true;
}

export interface FenceLink {
  fromId: string;
  toId: string;
}

/**
 * Phase 61: Fence and Gate are both "wall segments" for the purposes of the
 * connected wall-line visual (redrawFenceLines in MainScene.ts) - a Gate is a
 * deliberate opening, not a missing piece of wall, so the line should still
 * read as one continuous fence with a gate in it rather than breaking in two.
 * Deliberately NOT used by MainScene's raider-blocking sample
 * (sampleForBlockingWall/findBlockingWall) - those go through the separate
 * blocksRaiderMovement predicate (buildingConfig.ts), since a Gate must never
 * block a raider's path while Fence/WoodenWall must.
 *
 * Phase 68: widened to include WoodenWall - a Wall segment placed adjacent to
 * a Fence/Gate line should render as one continuous connected wall, and the
 * enclosure BFS (queryEnclosureTile below) treats it as a boundary tile the
 * same way it treats Fence.
 *
 * Phase 69: widened to include WoodenGate, regardless of its open/closed
 * state - the connected wall-line visual is purely cosmetic/connectivity
 * (same reasoning as the legacy Gate above: a deliberate opening still reads
 * as one continuous fence with a gate in it), so a WoodenGate should draw
 * into the line whether it's currently passable or not.
 */
function isWallSegment(building: PlacedBuilding): boolean {
  return (
    building.type === BuildingType.Fence ||
    building.type === BuildingType.Gate ||
    building.type === BuildingType.WoodenWall ||
    building.type === BuildingType.WoodenGate
  );
}

/** Right/down-only adjacency so each wall-segment pair (Fence/Gate) is reported once, for drawing connected wall-line segments. */
export function getFenceLinks(): FenceLink[] {
  const links: FenceLink[] = [];
  for (const building of placedBuildings) {
    if (!isWallSegment(building)) {
      continue;
    }
    const right = getBuildingAtTile(building.tileX + 1, building.tileY);
    if (right && isWallSegment(right)) {
      links.push({ fromId: building.id, toId: right.id });
    }
    const down = getBuildingAtTile(building.tileX, building.tileY + 1);
    if (down && isWallSegment(down)) {
      links.push({ fromId: building.id, toId: down.id });
    }
  }
  return links;
}

function isBuildingConnected(building: PlacedBuilding): boolean {
  const queue = [...collectAdjacentRoadIds(building)];
  const visited = new Set<string>(queue);

  while (queue.length > 0) {
    const roadId = queue.shift()!;
    const road = buildingsById.get(roadId);
    if (!road) {
      continue;
    }

    for (const [x, y] of orthogonalNeighbors(road.tileX, road.tileY)) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH_TILES || y >= MAP_HEIGHT_TILES) {
        continue;
      }
      const id = occupancy[y][x];
      if (!id || id === building.id) {
        continue;
      }
      const neighbor = buildingsById.get(id);
      if (!neighbor) {
        continue;
      }
      if (neighbor.type === BuildingType.Road) {
        if (!visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push(neighbor.id);
        }
      } else {
        return true;
      }
    }
  }

  return false;
}

export function updateConnections(): void {
  for (const building of placedBuildings) {
    building.connected = building.type === BuildingType.Road ? false : isBuildingConnected(building);
  }
  gameEvents.emit('connections-updated');
}

export function getBuildingAtTile(tileX: number, tileY: number): PlacedBuilding | null {
  if (tileY < 0 || tileY >= MAP_HEIGHT_TILES || tileX < 0 || tileX >= MAP_WIDTH_TILES) {
    return null;
  }
  const id = occupancy[tileY][tileX];
  return id ? (buildingsById.get(id) ?? null) : null;
}

export function getBuildingById(id: string): PlacedBuilding | null {
  return buildingsById.get(id) ?? null;
}

export function getPlacedBuildings(): readonly PlacedBuilding[] {
  return placedBuildings;
}

/**
 * Phase 42: player-facing staffing control. Mutates the field only - the
 * next assignWorkforce pass (already run unconditionally every tick) picks
 * up the new order on its own, so there is nothing else to recompute here.
 */
export function setBuildingPriority(buildingId: string, priority: WorkerPriority): boolean {
  const building = buildingsById.get(buildingId);
  if (!building) {
    return false;
  }
  building.priority = priority;
  return true;
}

const WORKER_PRIORITY_RANK: Record<WorkerPriority, number> = { high: 0, normal: 1, low: 2 };

/**
 * Recomputed from scratch every tick (not persisted on the building) so that
 * placing/losing a House immediately affects staffing on the very next tick,
 * with no stale "still employed" state to invalidate.
 *
 * Phase 42: the greedy assignment pass now walks buildings in priority order
 * (High, then Normal, then Low) rather than raw placement order, via a
 * stable sort of a scratch copy - `Array.prototype.sort` is stable, so ties
 * within a tier fall back to the original placement order exactly as before.
 * `placedBuildings` itself, and every other pass that iterates it, is left
 * untouched.
 *
 * Phase 46: total population is now the SUM of each House's current-tier
 * population (HOUSE_TIER_CONFIG), not a flat POPULATION_PER_HOUSE per House -
 * a Tier 2/3 House contributes more workforce than a Tier 1 one. No hp/
 * disabled filter here, matching the pre-Phase-46 count-based version exactly
 * (a destroyed House is already removed from placedBuildings entirely).
 */
function assignWorkforce(): void {
  // Phase 84: Kinfolk prestige upgrade grants flat permanent population
  // capacity independent of any standing House - added on top of the
  // House-derived sum, never replacing it.
  totalPopulation =
    placedBuildings
      .filter(
        (building) =>
          building.type === BuildingType.House &&
          !(building.constructionTicksRemaining && building.constructionTicksRemaining > 0),
      )
      .reduce((sum, building) => sum + HOUSE_TIER_CONFIG[building.houseTier].population, 0) +
    getActivePrestigeModifiers().permanentPopulationBonus;

  let available = totalPopulation;
  let employed = 0;
  let demand = 0;

  const ordered = [...placedBuildings].sort(
    (a, b) => WORKER_PRIORITY_RANK[a.priority] - WORKER_PRIORITY_RANK[b.priority],
  );

  for (const building of ordered) {
    // A 0 HP building has no one working in it; recomputed every tick, so this
    // also covers a building that just dropped to 0 HP mid-game.
    if (building.hp <= 0) {
      building.assignedWorkers = 0;
      building.staffed = false;
      continue;
    }

    // Construction mechanic: a building still being built has no workers
    // yet and doesn't compete for the population pool - it isn't producing
    // anything to staff.
    if (building.constructionTicksRemaining && building.constructionTicksRemaining > 0) {
      building.assignedWorkers = 0;
      building.staffed = false;
      continue;
    }

    const workersRequired = getWorkersRequired(building.type);
    if (workersRequired <= 0) {
      building.assignedWorkers = 0;
      building.staffed = true;
      continue;
    }

    demand += workersRequired;

    // First-come-first-served within a priority tier: a building's
    // assignment is capped at whatever population remains, so once the pool
    // runs dry every later building in this priority-ordered pass gets zero
    // workers this tick.
    const assigned = Math.min(available, workersRequired);
    building.assignedWorkers = assigned;
    building.staffed = assigned === workersRequired;
    available -= assigned;
    employed += assigned;
  }

  employedPopulation = employed;
  idlePopulation = available;
  laborShortfall = Math.max(0, demand - totalPopulation);
}

/** Phase 29: read by MainScene's raid scheduling to bias faction pick/interval once total deposits cross BANK_RISK_THRESHOLD. */
export function getTotalBankBalance(): number {
  return placedBuildings
    .filter((building) => building.type === BuildingType.Bank)
    .reduce((sum, building) => sum + building.bankBalance, 0);
}

export function getStorageCap(): number {
  // Phase 64: Granaries stack into the same sum on the exact same
  // staffed/enabled/alive terms as Warehouses - a disabled or 0-HP one
  // contributes nothing, so losing storage to a raid works identically for
  // both building types.
  let bonus = 0;
  for (const building of placedBuildings) {
    if (!building.staffed || building.disabled || building.hp <= 0) {
      continue;
    }
    if (building.type === BuildingType.Warehouse) {
      bonus += WAREHOUSE_STORAGE_BONUS;
    } else if (building.type === BuildingType.Granary) {
      bonus += GRANARY_STORAGE_BONUS;
    }
  }
  return BASE_STORAGE_CAP + bonus;
}

/**
 * Fixed-rate autonomous sellers (Supermarket, Saloon, and Phase 92's Market
 * Stall) don't fit the input->output production shape: they read/write the
 * shared resource pool and Money directly, and "active" reflects whether a
 * sale actually happened this tick rather than whether inputs were
 * available. Run as a separate pass after normal production so a seller can
 * sell goods other buildings produced earlier in the same tick.
 *
 * Phase 92 collapsed what were two byte-identical loops (runSupermarketSales
 * / runSaloonSales, differing only in building type, rate table and which
 * PlacedBuilding field the result was written to) into this one generic
 * pass, rather than pasting a third copy for the Market Stall. The three
 * still keep SEPARATE rate tables and SEPARATE result fields - the reason
 * Phase 27 gave for not sharing those is still valid (a change to one
 * building's sellable-goods list must not silently move another's) - but
 * there is now exactly one implementation of "sell up to `amount` of each
 * listed good at the live market price".
 *
 * Every seller draws down and depresses the SAME market (getCurrentMarketPrice
 * / recordMarketSaleVolume), so a Market Stall dumping eggs lowers what a
 * Supermarket gets for eggs, exactly as two Supermarkets already did.
 */
function runFixedRateSales<K extends ResourceKey>(
  type: BuildingType,
  rates: Record<K, { amount: number; price: number }>,
  assignSale: (building: PlacedBuilding, sale: AutoSale<K>) => void,
): void {
  for (const building of placedBuildings) {
    if (building.type !== type) {
      continue;
    }

    if (!building.staffed) {
      building.active = false;
      assignSale(building, { sold: {}, revenue: 0 });
      continue;
    }

    const sold: Partial<Record<K, number>> = {};
    let revenue = 0;
    let anySold = false;

    for (const [key, rate] of Object.entries(rates) as [K, { amount: number; price: number }][]) {
      const soldAmount = Math.min(rate.amount, resources[key]);
      resources[key] -= soldAmount;
      addConsumedThisTick(key, soldAmount);
      // Phase 51: the rate table's `price` is now only the market's baseline
      // peg - the actual sale reads the live, fluctuating price.
      // Phase 55: Gold Rush layers a temporary global spike on top of
      // state/market.ts's own drift/pressure/merchant-deal pricing.
      const price = getCurrentMarketPrice(key as MarketableResourceKey) * getGoldRushMultiplier();
      revenue += soldAmount * price;
      recordMarketSaleVolume(key as MarketableResourceKey, soldAmount);
      addSoldThisRun(key, soldAmount);
      sold[key] = Math.round(soldAmount * 10) / 10;
      if (soldAmount > 0) {
        anySold = true;
      }
    }

    money = Math.round((money + revenue) * 100) / 100;

    assignSale(building, { sold, revenue: Math.round(revenue * 100) / 100 });
    building.active = anySold;
  }
}

function runSupermarketSales(): void {
  runFixedRateSales(BuildingType.Supermarket, SUPERMARKET_SELL_RATES, (building, sale) => {
    building.lastSale = sale;
  });
}

function runSaloonSales(): void {
  runFixedRateSales(BuildingType.Saloon, SALOON_SELL_RATES, (building, sale) => {
    building.saloonSale = sale;
  });
}

/** Phase 92: the always-unlocked entry point to the sell economy. */
function runMarketStallSales(): void {
  runFixedRateSales(BuildingType.MarketStall, MARKET_STALL_SELL_RATES, (building, sale) => {
    building.marketStallSale = sale;
  });
}

/**
 * Phase 51: Trading Post. Unlike Supermarket/Saloon's fixed per-type rate
 * table, each Trading Post carries its own player-configured `tradeOrders`
 * (set via setTradingPostOrder) - "sell up to `amount`/tick, but only once
 * stock exceeds `threshold`". Draws from the same fluctuating market price
 * and feeds the same volume-pressure tracking as the other two sell passes,
 * so a player dumping stock through a Trading Post depresses the price a
 * Supermarket/Saloon (or another Trading Post) would get for the same good,
 * and vice versa - there's one market, not three.
 */
function runTradingPostSales(): void {
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.TradingPost) {
      continue;
    }

    if (!building.staffed) {
      building.active = false;
      building.tradingPostSale = { sold: {}, revenue: 0 };
      continue;
    }

    const sold: Partial<Record<MarketableResourceKey, number>> = {};
    let revenue = 0;
    let anySold = false;

    for (const [key, order] of Object.entries(building.tradeOrders) as [MarketableResourceKey, TradeOrderConfig][]) {
      if (!order.enabled || order.amount <= 0) {
        continue;
      }
      const availableAboveThreshold = resources[key] - order.threshold;
      const soldAmount = Math.min(order.amount, Math.max(0, availableAboveThreshold));
      if (soldAmount <= 0) {
        continue;
      }

      resources[key] -= soldAmount;
      addConsumedThisTick(key, soldAmount);
      // Phase 55: Gold Rush layers a temporary global spike on top of
      // state/market.ts's own drift/pressure/merchant-deal pricing.
      const price = getCurrentMarketPrice(key) * getGoldRushMultiplier();
      revenue += soldAmount * price;
      recordMarketSaleVolume(key, soldAmount);
      addSoldThisRun(key, soldAmount);
      sold[key] = Math.round(soldAmount * 10) / 10;
      anySold = true;
    }

    money = Math.round((money + revenue) * 100) / 100;

    building.tradingPostSale = {
      sold,
      revenue: Math.round(revenue * 100) / 100,
    };
    building.active = anySold;
  }
}

/**
 * Phase 51: player-facing Trading Post configuration, one resource row at a
 * time (mirrors setBuildingPriority's "mutate the field, let the next tick
 * pick it up" shape). Passing `undefined` for `enabled`/`threshold`/`amount`
 * keeps that field's current value (or the TRADING_POST_DEFAULT_* seed if the
 * order doesn't exist yet), so the info panel's toggle button and its two
 * number inputs can each call this independently without clobbering the
 * other two fields.
 */
export function setTradingPostOrder(
  buildingId: string,
  key: MarketableResourceKey,
  update: Partial<TradeOrderConfig>,
): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.TradingPost) {
    return false;
  }

  const existing: TradeOrderConfig = building.tradeOrders[key] ?? {
    enabled: false,
    threshold: TRADING_POST_DEFAULT_THRESHOLD,
    amount: TRADING_POST_DEFAULT_AMOUNT,
  };

  building.tradeOrders = {
    ...building.tradeOrders,
    [key]: {
      enabled: update.enabled ?? existing.enabled,
      threshold: Math.max(0, update.threshold ?? existing.threshold),
      amount: Math.max(0, update.amount ?? existing.amount),
    },
  };

  return true;
}

/**
 * Phase 46: Population Needs & House Tiers. Run after the production/sales
 * passes (runSupermarketSales/runSaloonSales) rather than before them, so a
 * House's Meat/Eggs/Clothes/Liquor need can be satisfied by goods finished
 * earlier in this very tick - Houses are consumers at the end of every chain,
 * the same position a Supermarket/Saloon sale occupies.
 *
 * Each House's current HOUSE_TIER_CONFIG entry is checked atomically: every
 * need group must have at least one affordable option (tried in the group's
 * declared key order) or nothing at all is consumed for that House this tick
 * - there's no partial credit for meeting 2 of 3 needs. A fully-met tick
 * collects that tier's tax into money and grows houseNeedsMetStreak (resetting
 * houseNeedsUnmetStreak); an unmet tick does the reverse. Crossing
 * HOUSE_TIER_HYSTERESIS_TICKS consecutive ticks in either direction flips the
 * tier exactly once and resets both streaks, so a tier can't cascade twice in
 * one debounce window. Skips destroyed (hp <= 0, though such a building is
 * normally already removed) and upkeep-unpaid (disabled) Houses entirely -
 * neither consuming, taxing, nor moving their streaks - matching how every
 * other pass in this file treats a disabled building as merely idle, not
 * penalized further.
 */
function runHouseNeeds(): void {
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.House) {
      continue;
    }
    if (building.hp <= 0 || building.disabled) {
      continue;
    }
    if (building.constructionTicksRemaining && building.constructionTicksRemaining > 0) {
      continue;
    }

    const tierConfig = HOUSE_TIER_CONFIG[building.houseTier];
    const nextTier: HouseTier | null = building.houseTier < 3 ? ((building.houseTier + 1) as HouseTier) : null;
    const nextTierConfig = nextTier !== null ? HOUSE_TIER_CONFIG[nextTier] : null;

    // Phase 70: Church, Clergy & the Tier-2 Service Gate. Computed once per
    // House per tick (isServedByChurch scans every placed Church, so this is
    // not free) and reused for both the growth check below and the
    // current-tier decay check further down - a House either has coverage
    // this tick or it doesn't, there's no reason to ask twice.
    const churchServed = isServedByChurch(building);

    // Growth eligibility is evaluated against the NEXT tier's needs (not the
    // current tier's - that was Bug 1: checking the current tier's trivial
    // needs let a house "grow" and then immediately fail the real needs of
    // the tier it just entered). Checked against resource levels *before*
    // this tick's own current-tier consumption below, so a tier's own draw
    // doesn't double up against a differently-sized need for the same
    // resource in the next tier's config. Church coverage is an ADDITIONAL,
    // non-resource gate on top of the resource needs - a House whose next
    // tier requires a Church cannot grow into it without one, regardless of
    // how well-stocked its resource needs are.
    const nextTierMet =
      nextTierConfig !== null &&
      nextTierConfig.needs.every((group) =>
        (Object.entries(group.options) as [ResourceKey, number][]).some(
          ([key, amount]) => resources[key] >= amount,
        ),
      ) &&
      (!nextTierConfig.requiresChurch || churchServed);

    const status: { label: string; met: boolean }[] = [];
    const picks: [ResourceKey, number][] = [];
    let allMet = true;

    for (const group of tierConfig.needs) {
      let picked: [ResourceKey, number] | null = null;
      for (const [key, amount] of Object.entries(group.options) as [ResourceKey, number][]) {
        if (resources[key] >= amount) {
          picked = [key, amount];
          break;
        }
      }
      status.push({ label: group.label, met: picked !== null });
      if (picked) {
        picks.push(picked);
      } else {
        allMet = false;
      }
    }

    // Phase 70 (design decision, confirmed): Church coverage loss decays a
    // House's CURRENT tier exactly like an unmet resource need - it feeds
    // the very same houseNeedsUnmetStreak/HOUSE_TIER_HYSTERESIS_TICKS
    // countdown below, not a separate counter. A Tier 2/3 House that loses
    // its Church (destroyed/unstaffed/upkeep-disabled) therefore now counts
    // as failing this tick's needs check even if every resource need is
    // still met.
    if (tierConfig.requiresChurch && !churchServed) {
      allMet = false;
    }

    building.houseNeedsStatus = status;

    if (allMet) {
      for (const [key, amount] of picks) {
        resources[key] -= amount;
        addConsumedThisTick(key, amount);
      }
      if (tierConfig.taxPerTick > 0) {
        // Phase 70: a Priest (not a Nun) adds CHURCH_PRIEST_TAX_BONUS extra
        // $/tick tax for every served Tier-2/3 House - one bonus per Priest
        // actually serving this House, since it's meant to reward fielding
        // Priests across real coverage, not a flat town-wide perk. Only
        // applies once the House itself already owes tax (Tier 1 never does).
        const servingPriestCount = tierConfig.requiresChurch ? countServingPriests(building) : 0;
        const churchTaxBonus = servingPriestCount * CHURCH_PRIEST_TAX_BONUS;
        money = Math.round((money + tierConfig.taxPerTick + churchTaxBonus) * 100) / 100;
      }
      building.houseNeedsUnmetStreak = 0;

      if (nextTier !== null && nextTierMet) {
        building.houseNeedsMetStreak += 1;

        if (building.houseNeedsMetStreak >= HOUSE_TIER_HYSTERESIS_TICKS) {
          building.houseTier = nextTier;
          building.houseNeedsMetStreak = 0;
          gameEvents.emit('house-tier-changed', { building, direction: 'upgrade' });
          addNotification(
            `A House grew to Tier ${building.houseTier} (population ${HOUSE_TIER_CONFIG[building.houseTier].population})`,
            'info',
            elapsedSeconds,
            building.id,
          );
        }
      } else {
        // Current tier is satisfied but either already maxed (nextTier null)
        // or the next tier's own needs aren't yet affordable - no progress
        // toward growth this tick.
        building.houseNeedsMetStreak = 0;
      }
    } else {
      building.houseNeedsUnmetStreak += 1;
      building.houseNeedsMetStreak = 0;

      if (building.houseNeedsUnmetStreak >= HOUSE_TIER_HYSTERESIS_TICKS && building.houseTier > 1) {
        building.houseTier = (building.houseTier - 1) as HouseTier;
        building.houseNeedsUnmetStreak = 0;
        gameEvents.emit('house-tier-changed', { building, direction: 'downgrade' });
        addNotification(
          `A House fell back to Tier ${building.houseTier} - needs went unmet`,
          'warning',
          elapsedSeconds,
          building.id,
        );
      }
    }
  }
}

/**
 * Phase 72: Brothel & Patronage Income. Called right after runHouseNeeds so
 * it reads that same tick's fresh house tiers (a House that just grew/fell
 * back this tick is reflected immediately, not one tick stale). Per staffed,
 * live, enabled Brothel with at least one hired lady: find every placed
 * House within BROTHEL_SERVICE_RADIUS_TILES (Chebyshev, from each building's
 * harvest-style center tile), cap the counted Houses at
 * `ladyCount * BROTHEL_HOUSES_PER_LADY` (first-found, no "best" selection -
 * intentionally simple per the design brief), and sum each counted House's
 * tier income multiplier (Tier 1 = 1.0x, 2 = 1.5x, 3 = 2.0x) rather than
 * multiplying the whole total by one representative tier. Income is
 * `ladyCount * BROTHEL_INCOME_PER_LADY_PER_HOUSE * (summed tier multipliers)`,
 * added directly to money like runHouseNeeds' tax collection. A Brothel with
 * zero ladies or zero Houses in range earns exactly $0/tick with no crash -
 * the multiplier sum and Math.min cap both degrade to 0 cleanly on an empty
 * Houses-in-range list.
 */
const BROTHEL_TIER_INCOME_MULTIPLIER: Record<HouseTier, number> = { 1: 1.0, 2: 1.5, 3: 2.0 };

function runBrothelIncome(): void {
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Brothel) {
      continue;
    }
    if (building.hp <= 0 || building.disabled || !building.staffed) {
      building.lastBrothelIncome = { housesServed: 0, income: 0 };
      continue;
    }
    const ladyCount = building.ladyCount ?? 0;
    if (ladyCount <= 0) {
      building.lastBrothelIncome = { housesServed: 0, income: 0 };
      continue;
    }

    const center = getHarvestCenterTile(building.tileX, building.tileY, building.type);
    const maxHouses = ladyCount * BROTHEL_HOUSES_PER_LADY;
    let tierMultiplierSum = 0;
    let housesServed = 0;

    for (const house of placedBuildings) {
      if (housesServed >= maxHouses) {
        break;
      }
      if (house.type !== BuildingType.House) {
        continue;
      }
      const houseCenter = getHarvestCenterTile(house.tileX, house.tileY, house.type);
      const distance = Math.max(Math.abs(houseCenter.tileX - center.tileX), Math.abs(houseCenter.tileY - center.tileY));
      if (distance > BROTHEL_SERVICE_RADIUS_TILES) {
        continue;
      }
      tierMultiplierSum += BROTHEL_TIER_INCOME_MULTIPLIER[house.houseTier];
      housesServed += 1;
    }

    const income = Math.round(ladyCount * BROTHEL_INCOME_PER_LADY_PER_HOUSE * tierMultiplierSum * 100) / 100;
    if (income > 0) {
      money = Math.round((money + income) * 100) / 100;
      gameEvents.emit('money-changed', money);
    }
    building.lastBrothelIncome = { housesServed, income };
  }
}

/**
 * Phase 31 deliberately deletes the old runHpRegen pass. Free, unconditional
 * 2%-per-tick healing meant raids had no lasting cost: anything short of a
 * kill simply undid itself, and a 0 HP building always came back on its own.
 * Damage is now permanent until paid for (repairBuilding), and a building
 * that reaches 0 HP is destroyed outright rather than idling as a
 * self-healing wreck. Unit HP regen went with it for the same reason - units
 * are mortal now (damageUnit).
 *
 * Phase 32: upkeep. Every staffed, enabled building bills its definition's
 * upkeep each tick. Buildings are billed in placement order and any building
 * the town can no longer pay for is flagged `disabled` for that tick instead
 * of being destroyed - a cash crisis idles your town, it doesn't bulldoze it.
 * Recomputed from scratch every tick (like assignWorkforce), so the moment
 * money comes back in, the same buildings switch themselves on again.
 *
 * Phase 39: each building's base upkeep is scaled by the run's chosen
 * difficulty (Easy cheaper, Hard pricier) rather than by editing the base
 * BUILDING_DEFINITIONS values, keeping those the Normal baseline.
 *
 * Phase 84: a second, independent multiplicative factor - the prestige shop's
 * upkeepDiscountMultiplier (Frontier Ledger / Iron Resolve) - composes
 * alongside DIFFICULTY_SETTINGS.upkeepMultiplier rather than replacing it, so
 * a Hard-mode player who has bought both upkeep upgrades still pays MORE than
 * Normal, just less than an equally-progressed Hard run with no upgrades.
 */
function runUpkeep(): number {
  let paid = 0;
  const upkeepMultiplier =
    DIFFICULTY_SETTINGS[currentDifficulty].upkeepMultiplier * getActivePrestigeModifiers().upkeepDiscountMultiplier;

  for (const building of placedBuildings) {
    const upkeep = BUILDING_DEFINITIONS[building.type].upkeep * upkeepMultiplier;
    if (upkeep <= 0 || !building.staffed) {
      building.disabled = false;
      upkeepDisabledNotified.delete(building.id);
      continue;
    }

    if (money >= upkeep) {
      money = Math.round((money - upkeep) * 100) / 100;
      paid += upkeep;
      building.disabled = false;
      // Recovery: allow a fresh notification if this building goes unpaid again later.
      upkeepDisabledNotified.delete(building.id);
    } else {
      building.disabled = true;
      // Phase 44: fire once on the transition into unpaid, not every tick it stays that way.
      if (!upkeepDisabledNotified.has(building.id)) {
        upkeepDisabledNotified.add(building.id);
        addNotification(
          `${BUILDING_DEFINITIONS[building.type].label} can't pay upkeep ($${upkeep}) - disabled until funds return`,
          'warning',
          elapsedSeconds,
          building.id,
        );
      }
    }
  }

  return paid;
}

/**
 * Phase 32: pulls this tick's yield out of real vegetation entities standing
 * near the building. Returns the outputs actually earned, scaled by how much
 * was really harvested - an exhausted radius yields nothing at all, which is
 * what makes over-harvesting bite. Forestry additionally rolls to replant,
 * passing its own "is this tile free of buildings" test down to the
 * vegetation module (which can't see occupancy itself).
 */
function runHarvest(building: PlacedBuilding, harvest: HarvestConfig): Partial<Record<ResourceKey, number>> | null {
  const { tileX: centerTileX, tileY: centerTileY } = getHarvestCenterTile(
    building.tileX,
    building.tileY,
    building.type,
  );

  if (harvest.replantChancePerTick && Math.random() < harvest.replantChancePerTick) {
    plantVegetation(
      harvest.kind,
      centerTileX,
      centerTileY,
      harvest.radiusTiles,
      (tileX, tileY) => occupancy[tileY]?.[tileX] == null,
    );
  }

  const target = findNearestVegetation(harvest.kind, centerTileX, centerTileY, harvest.radiusTiles);
  if (!target) {
    building.lastHarvest = 0;
    return null;
  }

  const taken = harvestVegetation(target, harvest.yieldPerTick);
  building.lastHarvest = taken;
  if (taken <= 0) {
    return null;
  }

  const ratio = taken / harvest.yieldPerTick;
  const outputs: Partial<Record<ResourceKey, number>> = {};
  for (const [key, amount] of Object.entries(harvest.outputs) as [ResourceKey, number][]) {
    outputs[key] = amount * ratio;
  }
  return outputs;
}

/**
 * Interest compounds every tick regardless of staffing - a Bank isn't a
 * production building, money sitting in it grows whether or not anyone is
 * currently working there. Gated on hp > 0 only (not staffed), matching
 * Phase 21's "0 HP = disabled" rule: a wrecked Bank's balance stops growing,
 * but that gate lives here rather than in withdrawFromBank, which has its
 * own separate hp check for the transaction itself.
 */
function runBankInterest(): void {
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Bank || building.hp <= 0 || building.bankBalance <= 0) {
      continue;
    }
    building.bankBalance = Math.round(building.bankBalance * (1 + BANK_INTEREST_RATE) * 100) / 100;
  }
}

/**
 * Construction mechanic: counts down every building's constructionTicksRemaining
 * by one, deleting the field (not zeroing it) the instant it reaches 0 -
 * `undefined` is the "fully built" steady state resolveBuildingTexture/
 * assignWorkforce/runUpkeep all already check for. Fires a one-time info
 * notification on completion.
 */
function runConstructionProgress(): void {
  for (const building of placedBuildings) {
    if (building.constructionTicksRemaining === undefined || building.constructionTicksRemaining <= 0) {
      continue;
    }
    building.constructionTicksRemaining -= 1;
    if (building.constructionTicksRemaining <= 0) {
      delete building.constructionTicksRemaining;
      addNotification(
        `${BUILDING_DEFINITIONS[building.type].label} finished construction`,
        'info',
        elapsedSeconds,
        building.id,
      );
    }
  }
}

/** Phase 44: which of a production building's required inputs are currently short, for the stall notification's message. */
function describeMissingInputs(inputs: Partial<Record<ResourceKey, number>>): string {
  return (Object.entries(inputs) as [ResourceKey, number][])
    .filter(([key, amount]) => resources[key] < amount)
    .map(([key]) => RESOURCE_LABELS[key])
    .join(', ');
}

function scaleByAnimalCount(
  outputPerAnimal: Partial<Record<ResourceKey, number>>,
  animalCount: number,
): Partial<Record<ResourceKey, number>> {
  const scaled: Partial<Record<ResourceKey, number>> = {};
  for (const [key, amount] of Object.entries(outputPerAnimal) as [ResourceKey, number][]) {
    scaled[key] = amount * animalCount;
  }
  return scaled;
}

export function runProductionTick(): void {
  if (gameOver) {
    return;
  }

  const before: Resources = { ...resources };
  // Phase 49: reset this tick's produced/consumed accumulators - every
  // mutation of `resources` below (inputs, outputs, sales, house needs) also
  // reports into these via addProducedThisTick/addConsumedThisTick.
  tickResourceProduced = {};
  tickResourceConsumed = {};

  // Phase 51: advance the market before anything sells this tick, so every
  // sell pass below reads a price that already reflects the drift/pressure/
  // merchant-deal state as of this tick, not last tick's.
  runMarketTick(elapsedSeconds);
  // Phase 55: expire a finished world event before this tick's production
  // loop reads the multiplier getters below, so a drought/disease/dust storm
  // that just ended doesn't apply for one extra tick.
  runWorldEventsTick(elapsedSeconds);

  runBankInterest();
  // Construction mechanic: decremented before assignWorkforce so a building
  // that finishes construction THIS tick is immediately eligible for
  // staffing/production the same tick, not one tick late.
  runConstructionProgress();
  assignWorkforce();
  runUpkeep();
  runTrainingQueues();
  const storageCap = getStorageCap();

  for (const building of placedBuildings) {
    const definition = BUILDING_DEFINITIONS[building.type];
    const production = definition.production;
    const harvest = definition.harvest;
    if (!production && !harvest) {
      building.active = false;
      continue;
    }

    if (building.hp <= 0) {
      building.active = false;
      recordProductivityTick(building.id, false, 'Destroyed');
      continue;
    }

    if (building.constructionTicksRemaining && building.constructionTicksRemaining > 0) {
      building.active = false;
      recordProductivityTick(building.id, false, 'Under construction');
      continue;
    }

    // Phase 32: an unpaid (upkeep-starved) building idles exactly like an
    // understaffed one - no output, but no damage and no removal either.
    if (!building.staffed || building.disabled) {
      building.active = false;
      recordProductivityTick(building.id, false, !building.staffed ? 'Understaffed' : 'Upkeep unpaid');
      continue;
    }

    // Animal-owning buildings (Chicken/Pig/Cattle Farm, Cow Ranch) produce
    // nothing until stocked, regardless of staffing/inputs being satisfied.
    const animalConfig = definition.animal;
    if (animalConfig && building.animalCount === 0) {
      building.active = false;
      recordProductivityTick(building.id, false, 'No animals owned');
      continue;
    }

    // Harvesters have no inputs and produce only what they can pull from
    // nearby vegetation this tick; a stripped radius means no output.
    let harvestOutputs: Partial<Record<ResourceKey, number>> | null = null;
    if (harvest) {
      harvestOutputs = runHarvest(building, harvest);
      if (!harvestOutputs) {
        building.active = false;
        recordProductivityTick(building.id, false, 'No vegetation in range');
        continue;
      }
    }

    const inputs = production?.inputs ?? {};
    const canRun = (Object.entries(inputs) as [ResourceKey, number][]).every(
      ([key, amount]) => resources[key] >= amount,
    );

    // Phase 44: debounced "production stalled" notification. Only meaningful
    // for buildings with declared inputs (harvesters/flat producers have none,
    // so `inputs` is `{}` and canRun is trivially true for them) - fires once
    // PRODUCTION_STALL_NOTIFY_TICKS after the block starts, resets the moment
    // it clears so a later stall can fire again.
    if (Object.keys(inputs).length > 0) {
      if (!canRun) {
        const ticks = (stalledInputTicks.get(building.id) ?? 0) + 1;
        stalledInputTicks.set(building.id, ticks);
        if (ticks >= PRODUCTION_STALL_NOTIFY_TICKS && !stalledInputNotified.has(building.id)) {
          stalledInputNotified.add(building.id);
          addNotification(
            `${BUILDING_DEFINITIONS[building.type].label} is stalled - missing ${describeMissingInputs(inputs)}`,
            'warning',
            elapsedSeconds,
            building.id,
          );
        }
      } else {
        stalledInputTicks.delete(building.id);
        stalledInputNotified.delete(building.id);
      }
    }

    if (!canRun) {
      building.active = false;
      recordProductivityTick(building.id, false, 'Missing inputs');
      continue;
    }

    for (const [key, amount] of Object.entries(inputs) as [ResourceKey, number][]) {
      resources[key] -= amount;
      addConsumedThisTick(key, amount);
    }
    let bonus = building.connected ? 1.1 : 1;
    // Phase 55: Dust Storm applies a small flat production dip to every
    // producing building uniformly (harvesters included, since harvestOutputs
    // is also scaled by `bonus` below) - a 1x multiplier when no dust storm
    // is active, so this is a no-op outside the event.
    bonus *= getDustStormProductionMultiplier();
    // Phase 30: a Well's yield falls off with its distance to open water.
    // Phase 55: Drought layers an additional, temporary penalty on top of
    // that existing distance-based falloff rather than replacing it.
    if (building.type === BuildingType.Well) {
      bonus *= wellOutputMultiplier(building) * getDroughtWellMultiplier();
    }
    // Phase 54: a water-dependent crop's yield falls off with its (Water
    // Tower-assisted) distance to water, the same shape as a Well above.
    if (building.type === BuildingType.PotatoField) {
      bonus *= getCropOutputMultiplier(building.tileX, building.tileY, building.type);
    }
    // Phase 55: Cattle Disease applies a temporary output penalty to every
    // animal-owning building (Chicken/Pig/Cattle Farm, Cow Ranch) alongside
    // whatever connection/well/crop bonus already applies.
    if (animalConfig) {
      bonus *= getCattleDiseaseMultiplier();
    }
    // Animal buildings scale their per-animal rate by how many animals are owned instead of using a flat production.outputs amount.
    const outputs = harvestOutputs
      ? harvestOutputs
      : animalConfig
        ? scaleByAnimalCount(animalConfig.outputPerAnimal, building.animalCount)
        : (production?.outputs ?? {});
    for (const [key, amount] of Object.entries(outputs) as [ResourceKey, number][]) {
      const produced = amount * bonus;
      const before = resources[key];
      const after = Math.min(before + produced, storageCap);
      resources[key] = after;
      addProducedThisTick(key, after - before);
      // Only score the amount that actually fit in storage; overflow is wasted output.
      if (key === 'meat') {
        totalMeatProduced += after - before;
      }
      // Phase 44: the amount that didn't fit is production silently discarded.
      // Debounced per resource key (not per building - the cap is global to
      // the pool) so it fires once on the transition into "wasting" rather
      // than every tick the pool stays pinned at the cap.
      const wasted = produced - (after - before);
      if (wasted > 0.001 && !resourcesWastingAtCap.has(key)) {
        resourcesWastingAtCap.add(key);
        addNotification(
          `${RESOURCE_LABELS[key]} storage is full - production is being wasted`,
          'warning',
          elapsedSeconds,
        );
      }
    }
    building.active = true;
    recordProductivityTick(building.id, true, null);
  }

  runMarketStallSales();
  runSupermarketSales();
  runSaloonSales();
  runTradingPostSales();
  runHouseNeeds();
  runBrothelIncome();

  // Recovery pass for the storage-waste notification: once a resource drops
  // back below the cap (a sale, a Warehouse coming online, etc.), clear its
  // flag so a future refill-to-cap can notify again.
  for (const key of resourcesWastingAtCap) {
    if (resources[key] < storageCap) {
      resourcesWastingAtCap.delete(key);
    }
  }

  for (const key of Object.keys(resources) as ResourceKey[]) {
    resourceTrends[key] = Math.round((resources[key] - before[key]) * 10) / 10;
  }
  pushResourceHistorySnapshot();

  checkBuildingUnlocks();
  runObjectivesCheck();
  runTownRankCheck();

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
  gameEvents.emit('production-tick');
}

/**
 * Phase 34: one second of run time. The run is DAY_COUNT day/night cycles
 * long, and the only thing this advances is `elapsedSeconds` - day number and
 * phase are derived from it (see getPhaseAtElapsed), so a phase transition is
 * detected by comparing the derived phase before and after the increment
 * rather than by maintaining a second, separately-decremented counter that
 * could fall out of sync with the day count.
 *
 * Phase 39: the DAY_COUNT buzzer is Fixed-mode only. Endless mode never hits
 * this branch, so elapsedSeconds just keeps counting up and the day/night
 * cycle keeps repeating - the only way an Endless run ends is the existing
 * 'destroyed' path in removeBuilding.
 */
export function tickTimer(): void {
  if (gameOver) {
    return;
  }

  const previousPhase = getDayPhase();
  const previousDay = getDayNumber();

  elapsedSeconds += 1;
  gameEvents.emit('timer-changed', getPhaseRemainingSeconds());

  if (currentRunMode === 'fixed' && elapsedSeconds >= GAME_DURATION_SECONDS) {
    endGame('time');
    return;
  }

  const phase = getDayPhase();
  const dayNumber = getDayNumber();
  if (phase !== previousPhase) {
    // Phase 56: "Survive N Nights Without Losing a Building" bookkeeping.
    // Cleared the instant night begins (a fresh, unblemished night ahead);
    // consulted at the following dawn - if removeBuilding's destroyed path
    // never flipped it during the night that just ended, that night counts.
    if (phase === 'night') {
      buildingLostThisNight = false;
    } else if (previousPhase === 'night' && !buildingLostThisNight) {
      nightsSurvivedCleanCount += 1;
    }
  }
  if (phase !== previousPhase || dayNumber !== previousDay) {
    gameEvents.emit('day-phase-changed', { dayNumber, phase });
  }
}

/**
 * Phase 32: the score. Cash on hand, every Bank's balance, the unsold
 * resource stock priced at RESOURCE_VALUES, and the full build cost of every
 * standing building - so hoarding, banking, stockpiling and expanding are all
 * legitimate strategies, and losing a building to a raid is a visible hit to
 * the number the player is graded on.
 */
export function computeNetWorth(): NetWorthBreakdown {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const banked = getTotalBankBalance();
  let resourceValue = 0;
  for (const [key, amount] of Object.entries(resources) as [ResourceKey, number][]) {
    resourceValue += amount * RESOURCE_VALUES[key];
  }
  const buildingValue = placedBuildings.reduce(
    (sum, building) => sum + BUILDING_DEFINITIONS[building.type].cost,
    0,
  );

  return {
    cash: round2(money),
    banked: round2(banked),
    resources: round2(resourceValue),
    buildings: round2(buildingValue),
    total: round2(money + banked + resourceValue + buildingValue),
  };
}

/**
 * Phase 31: 0..1 measure of how much heat the town is drawing, blended evenly
 * from elapsed game time (raids ramp up over a run regardless of play) and
 * net worth (a rich town is a target). This generalizes Phase 29's
 * bank-balance-only raid hook: banked cash still raises threat, but now as
 * one component of overall wealth rather than its own special case.
 */
/**
 * Phase 34: rebased from the old one-shot countdown (`remainingSeconds`,
 * which no longer exists as a monotonically-shrinking value) onto elapsed run
 * time. Behaviour is identical to Phase 31's over a full run - 0 at the start,
 * 1 at the buzzer - but it no longer breaks the moment the clock repeats.
 *
 * Phase 39: the time-based half of the blend is now mode/difficulty-aware.
 * Fixed mode keeps dividing by GAME_DURATION_SECONDS (scaled by the
 * difficulty's raidEscalationMultiplier - 1 for Normal reproduces the exact
 * pre-Phase-39 curve). Endless mode has no total run length to divide
 * against, so it saturates asymptotically against completed day/night
 * cycles instead (see ENDLESS_THREAT_RAMP_CYCLES) rather than hitting the old
 * fixed-mode ceiling once and sitting flat at 1 for the rest of what could be
 * an hours-long run.
 */
export function getThreatLevel(): number {
  const raidEscalationMultiplier = DIFFICULTY_SETTINGS[currentDifficulty].raidEscalationMultiplier;

  let elapsedFraction: number;
  if (currentRunMode === 'endless') {
    const cyclesElapsed = (elapsedSeconds / CYCLE_SECONDS) * raidEscalationMultiplier;
    elapsedFraction = cyclesElapsed / (cyclesElapsed + ENDLESS_THREAT_RAMP_CYCLES);
  } else {
    const scaledDuration = GAME_DURATION_SECONDS / raidEscalationMultiplier;
    elapsedFraction = Math.min(1, elapsedSeconds / scaledDuration);
  }

  const wealthFraction = Math.min(1, computeNetWorth().total / THREAT_NET_WORTH_FULL);
  return Math.min(1, elapsedFraction * 0.5 + wealthFraction * 0.5);
}

/**
 * Phase 80: Uncapped Threat / Infinite Escalation. getThreatLevel() above is
 * left completely unchanged - it stays a clamped 0..1 value forever, and
 * three existing MainScene call sites (the raid-interval squeeze, the
 * Outlaw-bias threshold, the wave-size/HP lerp) keep reading it exactly as
 * before. This is a second, deliberately UNBOUNDED value that only starts
 * moving once getThreatLevel() would otherwise be pinned at its ceiling:
 *
 *  - Tier 0 covers every state where today's blend (elapsedFraction * 0.5 +
 *    wealthFraction * 0.5) has NOT yet saturated at 1 - i.e. wherever
 *    getThreatLevel() itself would already be less than 1, this returns 0
 *    and reproduces today's behavior exactly (verified: elapsedFraction as
 *    computed by getThreatLevel can only equal 1 in fixed mode once elapsed
 *    time reaches the full scaled run length; in endless mode the asymptotic
 *    cycles/(cycles+RAMP) curve never actually reaches 1, so the elapsed half
 *    alone can never saturate getThreatLevel in endless mode - only wealth
 *    can, matching the phase brief's framing that net worth is what plateaus
 *    threat in the now-default endless mode).
 *  - Past that point, the tier climbs by 1 per ESCALATION_NET_WORTH_PER_TIER
 *    of net worth beyond THREAT_NET_WORTH_FULL, floor-divided so it only
 *    ticks over on whole multiples (never a fractional tier).
 *  - raidEscalationMultiplier (the same DIFFICULTY_SETTINGS field
 *    getThreatLevel already reads) speeds this up/slows it down exactly like
 *    it does the time-based half of getThreatLevel - Hard reaches tier 1
 *    sooner than Normal, Easy later - so a harder difficulty's late-game stays
 *    harder rather than the two systems disagreeing once threat itself maxes
 *    out.
 */
export function getEscalationTier(): number {
  const netWorth = computeNetWorth().total;
  const excessNetWorth = netWorth - THREAT_NET_WORTH_FULL;
  if (excessNetWorth <= 0) {
    return 0;
  }

  const raidEscalationMultiplier = DIFFICULTY_SETTINGS[currentDifficulty].raidEscalationMultiplier;
  const scaledExcess = excessNetWorth * raidEscalationMultiplier;
  return Math.floor(scaledExcess / ESCALATION_NET_WORTH_PER_TIER);
}

/**
 * Phase 57: Raider Camps loot payout, called by MainScene's destroyRaiderCamp
 * once a camp's hp reaches 0. Mirrors runObjectivesCheck's own reward-
 * granting shape immediately below - money added directly, materials added
 * straight to the resource pool bypassing the storage cap - since this is a
 * loot drop, not production output that should be able to overflow/waste.
 */
export function grantRaiderCampLoot(moneyAmount: number, materials: Partial<Record<ResourceKey, number>>): void {
  money = Math.round((money + moneyAmount) * 100) / 100;
  for (const [key, amount] of Object.entries(materials) as [ResourceKey, number][]) {
    resources[key] += amount;
  }
  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
}

export function getResourceTrends(): Readonly<Resources> {
  return resourceTrends;
}

/**
 * Phase 49: appends one entry per resource to `resourceHistory` from this
 * tick's accumulators plus the already-computed `resourceTrends` (so `net`
 * can never disagree with the HUD's own trend readout), then trims each
 * buffer back down to `RESOURCE_HISTORY_LENGTH`. Called once, at the very end
 * of runProductionTick's resource bookkeeping - after resourceTrends itself
 * has just been recomputed from `before`/`resources`.
 */
function pushResourceHistorySnapshot(): void {
  for (const key of Object.keys(resources) as ResourceKey[]) {
    const entry: ResourceHistoryEntry = {
      produced: Math.round((tickResourceProduced[key] ?? 0) * 100) / 100,
      consumed: Math.round((tickResourceConsumed[key] ?? 0) * 100) / 100,
      net: resourceTrends[key],
    };
    const buffer = resourceHistory[key];
    buffer.push(entry);
    if (buffer.length > RESOURCE_HISTORY_LENGTH) {
      buffer.shift();
    }
  }
}

/** Phase 49: oldest-first rolling window (see `pushResourceHistorySnapshot`), for the Statistics panel's per-resource sparkline. */
export function getResourceHistory(key: ResourceKey): readonly ResourceHistoryEntry[] {
  return resourceHistory[key];
}

/**
 * Phase 49: null means "not tracked" - only buildings with a `production` or
 * `harvest` config are recorded (see `recordProductivityTick`'s call sites in
 * runProductionTick), since a building with neither (Road, House, Warehouse,
 * Bank, Barracks, Horsery, Watchtower, Supermarket, Saloon, ...) has no
 * on/off production state for a percentage to describe.
 */
export function getBuildingProductivity(buildingId: string): BuildingProductivity | null {
  const record = productivityRecords.get(buildingId);
  if (!record) {
    return null;
  }
  return {
    activeTicks: record.window.filter(Boolean).length,
    totalTicks: record.window.length,
    blockReason: record.lastBlockReason,
  };
}

/**
 * Bug 2 fix: feeds endGame's GameOverSummary from the lifetime
 * buildingsEverBuiltByType counter rather than the live `placedBuildings`
 * list - a Town-Destroyed ending fires the instant the last building's
 * record is removed, so counting live buildings here always produced "None".
 * This function has no other callers (verified), so it was safe to repurpose
 * rather than adding a parallel one.
 */
function countBuildingsByType(): Record<BuildingType, number> {
  const counts = {} as Record<BuildingType, number>;
  for (const type of Object.values(BuildingType)) {
    counts[type] = buildingsEverBuiltByType[type] ?? 0;
  }
  return counts;
}

function endGame(reason: GameOverReason): void {
  if (gameOver) {
    return;
  }
  gameOver = true;

  const townRank = getTownRank();
  // Phase 84: the death/time-up path earns legacy same as a voluntary
  // cash-out would for an equivalent snapshot, minus the voluntary bonus
  // (see prestige.ts's computeLegacyEarned doc comment for the reasoning) -
  // a player who never prestiges is still rewarded for how far the town got.
  const legacyEarned = computeLegacyEarned(
    { rank: townRank, netWorth: computeNetWorth().total, daysSurvived: getDayNumber() },
    currentDifficulty,
    false,
  );
  earnLegacy(legacyEarned);

  gameEvents.emit('game-over', {
    netWorth: computeNetWorth(),
    totalMeatProduced: Math.round(totalMeatProduced * 10) / 10,
    buildingCounts: countBuildingsByType(),
    reason,
    daysSurvived: getDayNumber(),
    difficulty: currentDifficulty,
    mode: currentRunMode,
    elapsedSeconds,
    townRank,
    legacyEarned,
  });
}

/**
 * Phase 84: gate for the voluntary "Establish a New Town" cash-out. An OR,
 * not an AND, per the approved design ("gated by minimum rank OR day") - a
 * player who has built a genuinely developed town (Village rank - Phase 83's
 * 3rd tier, requiring $7000 net worth / 16 population / 5 completed
 * objectives on top of the day count) should be able to cash out even on a
 * short/fast run that hasn't reached the day minimum yet, and a player deep
 * into a long grinding run should be able to cash out on tenure alone even if
 * their town stayed small. Either alone already represents real, deliberate
 * investment - an AND would force both, which is a strictly harder bar than
 * either "achievement" was designed to represent on its own.
 *
 * Minimum rank: 'village' (Phase 83's 3rd of 6 tiers) - low enough to be
 * reachable in a single normal-length session (it is NOT the max rank),
 * high enough that it cannot be reached in the first few minutes: Village
 * requires day >= 4 anyway, so on the rank axis alone the gate is already at
 * least a small handful of day/night cycles away from a fresh reset.
 *
 * Minimum day: 4 - matches Village's own daysSurvivedAtLeast threshold
 * exactly, so the day-only branch of the OR represents the same rough amount
 * of real playtime as the rank-only branch typically takes, rather than one
 * side of the OR being trivially easier than the other. Both together rule
 * out the degenerate "reset immediately, repeatedly" exploit the design
 * brief calls out: a fresh town cannot pass either check before day 4 at the
 * very earliest, and in practice reaching Village rank that fast requires
 * genuinely rushing net worth/population/objectives, not just waiting.
 */
export const PRESTIGE_MIN_RANK: TownRank = 'village';
export const PRESTIGE_MIN_DAY = 4;

export interface EstablishNewTownGate {
  allowed: boolean;
  reason?: string;
}

export function canEstablishNewTown(): EstablishNewTownGate {
  if (gameOver) {
    return { allowed: false, reason: 'The run has already ended.' };
  }

  const rank = getTownRank();
  const day = getDayNumber();
  const rankMet = TOWN_RANK_ORDER.indexOf(rank) >= TOWN_RANK_ORDER.indexOf(PRESTIGE_MIN_RANK);
  const dayMet = day >= PRESTIGE_MIN_DAY;

  if (rankMet || dayMet) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Reach ${TOWN_RANK_LABELS[PRESTIGE_MIN_RANK]} rank or survive to Day ${PRESTIGE_MIN_DAY} first (currently ${TOWN_RANK_LABELS[rank]}, Day ${day}).`,
  };
}

/**
 * Voluntary cash-out: validates the gate, banks legacy from the CURRENT
 * town's snapshot (with the voluntary-cashout bonus - see
 * prestige.ts's computeLegacyEarned), then performs a full resetGame() -
 * fresh terrain, buildings, resources, day counter, everything except the
 * legacy points/purchased upgrades that just got (or already were) banked,
 * exactly matching Decision 1's "full wipe, fresh map" design. Returns false
 * (no-op) if the gate isn't met, so a caller never has to duplicate
 * canEstablishNewTown's own check before calling this.
 */
export function establishNewTown(): boolean {
  const gate = canEstablishNewTown();
  if (!gate.allowed) {
    return false;
  }

  const townRank = getTownRank();
  const legacyEarned = computeLegacyEarned(
    { rank: townRank, netWorth: computeNetWorth().total, daysSurvived: getDayNumber() },
    currentDifficulty,
    true,
  );
  earnLegacy(legacyEarned);
  recordTownFounded();

  const difficulty = currentDifficulty;
  const mode = currentRunMode;
  resetGame({ mode, difficulty });

  gameEvents.emit('town-established', { legacyEarned });
  return true;
}

/**
 * Phase 39: options default to Fixed/Normal so any caller that doesn't pass
 * them (there are none left, but this keeps the function regression-safe as
 * a public API) reproduces the exact pre-Phase-39 run. The
 * DifficultySelectOverlay's Start button is the only real caller, passing the
 * player's picked mode/difficulty.
 */
export function resetGame(options?: { mode?: RunMode; difficulty?: Difficulty }): void {
  // Phase 65: Endless is now the default/primary mode - Fixed stays fully
  // intact and selectable, just no longer the implicit choice for a caller
  // that omits `mode`.
  currentRunMode = options?.mode ?? 'endless';
  currentDifficulty = options?.difficulty ?? 'normal';

  // Phase 84: every reset now reseeds a fresh map (regenerateWorldTiles was
  // wired up but never actually called before this phase) - "Establish a New
  // Town" relies on resetGame's own reseed behavior rather than needing a
  // second, separate reseed path, so this must be unconditional here rather
  // than gated on some "is this a prestige reset" flag. MainScene rebuilds
  // its tilemap layer/camera bounds from getWorldTiles() on 'game-reset'.
  regenerateWorldTiles();

  const prestigeModifiers = getActivePrestigeModifiers();
  money =
    Math.round(
      (STARTING_MONEY * DIFFICULTY_SETTINGS[currentDifficulty].startingMoneyMultiplier +
        prestigeModifiers.startingMoneyBonus) *
        prestigeModifiers.startingMoneyMultiplier *
        100,
    ) / 100;
  Object.assign(resources, emptyResources());
  resourceTrends = emptyResources();
  resourceHistory = emptyResourceHistoryBuffers();
  tickResourceProduced = {};
  tickResourceConsumed = {};
  productivityRecords.clear();
  enclosureCache.clear();
  totalMeatProduced = 0;
  elapsedSeconds = 0;
  gameOver = false;
  totalPopulation = 0;
  employedPopulation = 0;
  idlePopulation = 0;
  laborShortfall = 0;

  placedBuildings.length = 0;
  buildingsById.clear();
  buildingsEverBuiltByType = {};
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    occupancy[y].fill(null);
  }

  // Phase 84: Trail Wagon's material stipend, clamped to the fresh-town
  // storage cap - computed AFTER placedBuildings is cleared above, so
  // getStorageCap() reads the new (zero-building, BASE_STORAGE_CAP-only)
  // town rather than momentarily reusing the previous run's Warehouse/Granary
  // bonuses on an establishNewTown() cash-out.
  resources.wood = Math.min(getStorageCap(), prestigeModifiers.startingWoodBonus);
  resources.tools = Math.min(getStorageCap(), prestigeModifiers.startingToolsBonus);

  clearNotificationDebounceState();
  clearNotifications();
  unlockNotified.clear();
  resetMarket();
  resetWorldEvents();

  cumulativeResourcesSold = {};
  totalUnitsTrained = 0;
  buildingLostThisNight = false;
  nightsSurvivedCleanCount = 0;
  currentTownRank = 'camp';
  initObjectiveQueue();

  // Terrain is intentionally kept across a reset (the player replays the same
  // map they just learned), but vegetation is reseeded so a run that felled
  // every tree doesn't start the next one on a bald map.
  resetVegetation();
  // Phase 57: a fresh run/reset never inherits the previous run's Raider
  // Camps - MainScene's own initialCampsSpawned flag (reset alongside this
  // via 'game-reset') re-triggers spawnInitialRaiderCamps() once Day
  // RAIDER_CAMP_SPAWN_DAY begins again.
  resetRaiderCamps();

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
  gameEvents.emit('timer-changed', getPhaseRemainingSeconds());
  // A reset always lands back on day 1 morning, so listeners that own
  // night-only visuals get told to go back to their daytime state.
  gameEvents.emit('day-phase-changed', { dayNumber: 1, phase: 'day' });
  gameEvents.emit('connections-updated');
  gameEvents.emit('game-reset');
}
