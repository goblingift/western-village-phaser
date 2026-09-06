import {
  BANK_INTEREST_RATE,
  BANK_TRANSACTION_AMOUNT,
  BASE_STORAGE_CAP,
  COWBOY_MAX_HP,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_TRAIN_COST,
  CYCLE_SECONDS,
  DAY_COUNT,
  DAY_PHASE_SECONDS,
  DEMOLISH_REFUND_FRACTION,
  Difficulty,
  DIFFICULTY_SETTINGS,
  ENDLESS_THREAT_RAMP_CYCLES,
  GAME_DURATION_SECONDS,
  GRAVEL_MAX_DISTANCE_TILES,
  HOUSE_TIER_HYSTERESIS_TICKS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MOUNTED_COWBOY_MAX_HP,
  MOUNTED_COWBOY_MAX_PER_HORSERY,
  MOUNTED_COWBOY_TRAIN_COST,
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
  WELL_MAX_WATER_DISTANCE_TILES,
  WELL_OUTPUT_BY_DISTANCE,
} from '../config/constants';
import {
  BUILDING_DEFINITIONS,
  BuildingType,
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
  SaloonSellableKey,
  SupermarketSellableKey,
  TradeOrderConfig,
  WorkerPriority,
  getWorkersRequired,
} from '../config/buildingConfig';
import { TileType, distanceToNearestTileType, distanceToNearestWater, isBuildableTerrain } from '../config/mapConfig';
import { VEGETATION_DEFINITIONS } from '../config/vegetationConfig';
import {
  countVegetationInRadius,
  findNearestVegetation,
  getVegetationAtTile,
  harvestVegetation,
  isTileBlockedByVegetation,
  plantVegetation,
  removeVegetation,
  resetVegetation,
} from './vegetation';
import { gameEvents } from './gameEvents';
import { addNotification, clearNotifications } from './notifications';
import { getCurrentMarketPrice, recordMarketSaleVolume, resetMarket, runMarketTick } from './market';

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
 * Phase 34: the clock is now elapsed-forward rather than a single countdown.
 * Everything else about the cycle (which day, which phase, how long is left in
 * it) is derived from this one number, so there is no way for the day counter
 * and the phase timer to drift apart.
 */
let elapsedSeconds = 0;
let gameOver = false;
let totalPopulation = 0;
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
 * in-bounds, dry land (water is impassable) and clear of vegetation - a tree
 * or cactus has to be harvested away before its tile can be built on.
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
      if (isTileBlockedByVegetation(x, y)) {
        return 'Blocked by vegetation';
      }
    }
  }
  return null;
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
  if (
    (type === BuildingType.Quarry || type === BuildingType.IronMine) &&
    getGravelDistance(tileX, tileY, type) === null
  ) {
    return `${BUILDING_DEFINITIONS[type].label} must be on or within ${GRAVEL_MAX_DISTANCE_TILES} tiles of Gravel`;
  }
  if (money < BUILDING_DEFINITIONS[type].cost) {
    return `Not enough money ($${BUILDING_DEFINITIONS[type].cost})`;
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
  if (!harvest) {
    return null;
  }

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

export function placeBuilding(tileX: number, tileY: number, type: BuildingType): PlacedBuilding | null {
  if (!canPlaceBuilding(tileX, tileY, type)) {
    return null;
  }

  const definition = BUILDING_DEFINITIONS[type];
  const { width, height } = definition.size;

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
    bankBalance: 0,
    disabled: false,
    priority: 'normal',
    houseTier: 1,
    houseNeedsMetStreak: 0,
    houseNeedsUnmetStreak: 0,
    houseNeedsStatus: [],
    tradeOrders: {},
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

  if (reason === 'destroyed') {
    addNotification(
      `${BUILDING_DEFINITIONS[building.type].label} was destroyed by raiders!`,
      'danger',
      elapsedSeconds,
      building.id,
    );
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
export function damageUnit(
  buildingId: string,
  kind: 'cowboy' | 'cowboyOnHorse',
  index: number,
  amount: number,
): number {
  const building = buildingsById.get(buildingId);
  if (!building) {
    return 0;
  }

  const hpArray = kind === 'cowboy' ? building.cowboyHp : building.mountedCowboyHp;
  if (index < 0 || index >= hpArray.length || hpArray[index] <= 0) {
    return 0;
  }

  hpArray[index] = Math.max(0, hpArray[index] - amount);
  if (hpArray[index] === 0) {
    if (kind === 'cowboy') {
      building.cowboyCount = Math.max(0, building.cowboyCount - 1);
    } else {
      building.mountedCowboyCount = Math.max(0, building.mountedCowboyCount - 1);
    }
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

export function hasAdjacentFence(building: PlacedBuilding): boolean {
  const { width, height } = BUILDING_DEFINITIONS[building.type].size;

  const isFence = (nx: number, ny: number): boolean => {
    if (!tileHasOtherBuilding(nx, ny, building.id)) {
      return false;
    }
    const neighbor = buildingsById.get(occupancy[ny][nx]!);
    return neighbor?.type === BuildingType.Fence;
  };

  for (let x = building.tileX; x < building.tileX + width; x++) {
    if (isFence(x, building.tileY - 1) || isFence(x, building.tileY + height)) {
      return true;
    }
  }
  for (let y = building.tileY; y < building.tileY + height; y++) {
    if (isFence(building.tileX - 1, y) || isFence(building.tileX + width, y)) {
      return true;
    }
  }

  return false;
}

/**
 * Buying an animal is a hard buy-gate, not a soft output multiplier: it
 * fails outright (no partial/half-output fallback) without an adjacent
 * Fence, at the per-building animal cap, or without enough money.
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
  if (!hasAdjacentFence(building)) {
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
 * Training a Cowboy is a hard buy-gate like buyAnimal, but with no Fence
 * requirement (that rule is animal-specific): just the per-Barracks cap,
 * affordability, and (Phase 21) not training out of a disabled 0 HP
 * Barracks. Not gated on staffing - staffing only gates production, and a
 * Barracks has none of its own.
 */
export function trainCowboy(buildingId: string): boolean {
  const building = buildingsById.get(buildingId);
  if (!building || building.type !== BuildingType.Barracks) {
    return false;
  }
  if (building.hp <= 0) {
    return false;
  }
  if (building.cowboyCount >= COWBOY_MAX_PER_BARRACKS) {
    return false;
  }
  if (money < COWBOY_TRAIN_COST) {
    return false;
  }

  money -= COWBOY_TRAIN_COST;
  building.cowboyCount += 1;
  building.cowboyHp.push(COWBOY_MAX_HP);

  gameEvents.emit('money-changed', money);
  gameEvents.emit('cowboy-trained', building);

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
  if (building.mountedCowboyCount >= MOUNTED_COWBOY_MAX_PER_HORSERY) {
    return false;
  }
  if (money < MOUNTED_COWBOY_TRAIN_COST) {
    return false;
  }

  money -= MOUNTED_COWBOY_TRAIN_COST;
  building.mountedCowboyCount += 1;
  building.mountedCowboyHp.push(MOUNTED_COWBOY_MAX_HP);

  gameEvents.emit('money-changed', money);
  gameEvents.emit('mounted-cowboy-trained', building);

  return true;
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

/** Right/down-only adjacency so each fence pair is reported once, for drawing connected fence-line segments. */
export function getFenceLinks(): FenceLink[] {
  const links: FenceLink[] = [];
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Fence) {
      continue;
    }
    const right = getBuildingAtTile(building.tileX + 1, building.tileY);
    if (right?.type === BuildingType.Fence) {
      links.push({ fromId: building.id, toId: right.id });
    }
    const down = getBuildingAtTile(building.tileX, building.tileY + 1);
    if (down?.type === BuildingType.Fence) {
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
  totalPopulation = placedBuildings
    .filter((building) => building.type === BuildingType.House)
    .reduce((sum, building) => sum + HOUSE_TIER_CONFIG[building.houseTier].population, 0);

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
  const staffedWarehouses = placedBuildings.filter(
    (building) =>
      building.type === BuildingType.Warehouse && building.staffed && !building.disabled && building.hp > 0,
  ).length;
  return BASE_STORAGE_CAP + WAREHOUSE_STORAGE_BONUS * staffedWarehouses;
}

/**
 * Supermarkets don't fit the input->output production shape: they read/write
 * the shared resource pool and Money directly, and "active" reflects whether
 * a sale actually happened this tick rather than whether inputs were
 * available. Run as a separate pass after normal production so a Supermarket
 * can sell Meat/Eggs that other buildings produced earlier in the same tick.
 */
function runSupermarketSales(): void {
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Supermarket) {
      continue;
    }

    if (!building.staffed) {
      building.active = false;
      building.lastSale = { sold: {}, revenue: 0 };
      continue;
    }

    const sold: Partial<Record<SupermarketSellableKey, number>> = {};
    let revenue = 0;
    let anySold = false;

    for (const [key, rate] of Object.entries(SUPERMARKET_SELL_RATES) as [SupermarketSellableKey, { amount: number; price: number }][]) {
      const soldAmount = Math.min(rate.amount, resources[key]);
      resources[key] -= soldAmount;
      addConsumedThisTick(key, soldAmount);
      // Phase 51: SUPERMARKET_SELL_RATES.price is now only the market's
      // baseline peg - the actual sale reads the live, fluctuating price.
      const price = getCurrentMarketPrice(key);
      revenue += soldAmount * price;
      recordMarketSaleVolume(key, soldAmount);
      sold[key] = Math.round(soldAmount * 10) / 10;
      if (soldAmount > 0) {
        anySold = true;
      }
    }

    money = Math.round((money + revenue) * 100) / 100;

    building.lastSale = {
      sold,
      revenue: Math.round(revenue * 100) / 100,
    };
    building.active = anySold;
  }
}

/**
 * Mirrors runSupermarketSales but reads/writes Saloon's own saloonSale field
 * against SALOON_SELL_RATES - a separate pass rather than a shared loop so
 * Supermarket's rate table/sale field stay untouched by this addition.
 */
function runSaloonSales(): void {
  for (const building of placedBuildings) {
    if (building.type !== BuildingType.Saloon) {
      continue;
    }

    if (!building.staffed) {
      building.active = false;
      building.saloonSale = { sold: {}, revenue: 0 };
      continue;
    }

    const sold: Partial<Record<SaloonSellableKey, number>> = {};
    let revenue = 0;
    let anySold = false;

    for (const [key, rate] of Object.entries(SALOON_SELL_RATES) as [SaloonSellableKey, { amount: number; price: number }][]) {
      const soldAmount = Math.min(rate.amount, resources[key]);
      resources[key] -= soldAmount;
      addConsumedThisTick(key, soldAmount);
      const price = getCurrentMarketPrice(key);
      revenue += soldAmount * price;
      recordMarketSaleVolume(key, soldAmount);
      sold[key] = Math.round(soldAmount * 10) / 10;
      if (soldAmount > 0) {
        anySold = true;
      }
    }

    money = Math.round((money + revenue) * 100) / 100;

    building.saloonSale = {
      sold,
      revenue: Math.round(revenue * 100) / 100,
    };
    building.active = anySold;
  }
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
      const price = getCurrentMarketPrice(key);
      revenue += soldAmount * price;
      recordMarketSaleVolume(key, soldAmount);
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

    const tierConfig = HOUSE_TIER_CONFIG[building.houseTier];
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

    building.houseNeedsStatus = status;

    if (allMet) {
      for (const [key, amount] of picks) {
        resources[key] -= amount;
        addConsumedThisTick(key, amount);
      }
      if (tierConfig.taxPerTick > 0) {
        money = Math.round((money + tierConfig.taxPerTick) * 100) / 100;
      }
      building.houseNeedsMetStreak += 1;
      building.houseNeedsUnmetStreak = 0;

      if (building.houseNeedsMetStreak >= HOUSE_TIER_HYSTERESIS_TICKS && building.houseTier < 3) {
        building.houseTier = (building.houseTier + 1) as HouseTier;
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
 */
function runUpkeep(): number {
  let paid = 0;
  const upkeepMultiplier = DIFFICULTY_SETTINGS[currentDifficulty].upkeepMultiplier;

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

  runBankInterest();
  assignWorkforce();
  runUpkeep();
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
    // Phase 30: a Well's yield falls off with its distance to open water.
    if (building.type === BuildingType.Well) {
      bonus *= wellOutputMultiplier(building);
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

  runSupermarketSales();
  runSaloonSales();
  runTradingPostSales();
  runHouseNeeds();

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

function countBuildingsByType(): Record<BuildingType, number> {
  const counts = {} as Record<BuildingType, number>;
  for (const type of Object.values(BuildingType)) {
    counts[type] = 0;
  }
  for (const building of placedBuildings) {
    counts[building.type] += 1;
  }
  return counts;
}

function endGame(reason: GameOverReason): void {
  if (gameOver) {
    return;
  }
  gameOver = true;
  gameEvents.emit('game-over', {
    netWorth: computeNetWorth(),
    totalMeatProduced: Math.round(totalMeatProduced * 10) / 10,
    buildingCounts: countBuildingsByType(),
    reason,
    daysSurvived: getDayNumber(),
  });
}

/**
 * Phase 39: options default to Fixed/Normal so any caller that doesn't pass
 * them (there are none left, but this keeps the function regression-safe as
 * a public API) reproduces the exact pre-Phase-39 run. The
 * DifficultySelectOverlay's Start button is the only real caller, passing the
 * player's picked mode/difficulty.
 */
export function resetGame(options?: { mode?: RunMode; difficulty?: Difficulty }): void {
  currentRunMode = options?.mode ?? 'fixed';
  currentDifficulty = options?.difficulty ?? 'normal';
  money = Math.round(STARTING_MONEY * DIFFICULTY_SETTINGS[currentDifficulty].startingMoneyMultiplier * 100) / 100;
  Object.assign(resources, emptyResources());
  resourceTrends = emptyResources();
  resourceHistory = emptyResourceHistoryBuffers();
  tickResourceProduced = {};
  tickResourceConsumed = {};
  productivityRecords.clear();
  totalMeatProduced = 0;
  elapsedSeconds = 0;
  gameOver = false;
  totalPopulation = 0;
  employedPopulation = 0;
  idlePopulation = 0;
  laborShortfall = 0;

  placedBuildings.length = 0;
  buildingsById.clear();
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    occupancy[y].fill(null);
  }

  clearNotificationDebounceState();
  clearNotifications();
  unlockNotified.clear();
  resetMarket();

  // Terrain is intentionally kept across a reset (the player replays the same
  // map they just learned), but vegetation is reseeded so a run that felled
  // every tree doesn't start the next one on a bald map.
  resetVegetation();

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
  gameEvents.emit('timer-changed', getPhaseRemainingSeconds());
  // A reset always lands back on day 1 morning, so listeners that own
  // night-only visuals get told to go back to their daytime state.
  gameEvents.emit('day-phase-changed', { dayNumber: 1, phase: 'day' });
  gameEvents.emit('connections-updated');
  gameEvents.emit('game-reset');
}
