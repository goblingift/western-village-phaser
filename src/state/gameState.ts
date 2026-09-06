import {
  BANK_INTEREST_RATE,
  BANK_TRANSACTION_AMOUNT,
  BASE_STORAGE_CAP,
  COWBOY_MAX_HP,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_TRAIN_COST,
  DEMOLISH_REFUND_FRACTION,
  GAME_DURATION_SECONDS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MOUNTED_COWBOY_MAX_HP,
  MOUNTED_COWBOY_MAX_PER_HORSERY,
  MOUNTED_COWBOY_TRAIN_COST,
  POPULATION_PER_HOUSE,
  REPAIR_COST_FRACTION,
  STARTING_MONEY,
  THREAT_NET_WORTH_FULL,
  WAREHOUSE_STORAGE_BONUS,
  WELL_MAX_WATER_DISTANCE_TILES,
  WELL_OUTPUT_BY_DISTANCE,
} from '../config/constants';
import {
  BUILDING_DEFINITIONS,
  BuildingType,
  HarvestConfig,
  PlacedBuilding,
  RESOURCE_VALUES,
  ResourceKey,
  SALOON_SELL_RATES,
  SUPERMARKET_SELL_RATES,
  SaloonSellableKey,
  SupermarketSellableKey,
  getWorkersRequired,
} from '../config/buildingConfig';
import { distanceToNearestWater, isBuildableTerrain } from '../config/mapConfig';
import {
  findNearestVegetation,
  harvestVegetation,
  isTileBlockedByVegetation,
  plantVegetation,
  resetVegetation,
} from './vegetation';
import { gameEvents } from './gameEvents';

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
  };
}

let money = STARTING_MONEY;
const resources: Resources = emptyResources();
/** Phase 33: per-resource change over the last completed tick, for the HUD's +X.X/tick trend readout. */
let resourceTrends: Resources = emptyResources();
const placedBuildings: PlacedBuilding[] = [];
const buildingsById = new Map<string, PlacedBuilding>();
const occupancy: (string | null)[][] = createEmptyOccupancy();
let totalMeatProduced = 0;
let remainingSeconds = GAME_DURATION_SECONDS;
let gameOver = false;
let totalPopulation = 0;
let employedPopulation = 0;
let idlePopulation = 0;

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

export function getRemainingSeconds(): number {
  return remainingSeconds;
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

export function canAfford(type: BuildingType): boolean {
  return money >= BUILDING_DEFINITIONS[type].cost;
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
 * Phase 30: the single source of truth for "why can't I put this here",
 * returning a player-facing reason string (or null when placement is legal).
 * canPlaceBuilding is now a thin boolean wrapper over it so the preview
 * tint and the actual placement rule can never disagree.
 */
export function getPlacementRejection(tileX: number, tileY: number, type: BuildingType): string | null {
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
  if (!canAfford(type)) {
    return `Not enough money ($${BUILDING_DEFINITIONS[type].cost})`;
  }
  return null;
}

export function canPlaceBuilding(tileX: number, tileY: number, type: BuildingType): boolean {
  return getPlacementRejection(tileX, tileY, type) === null;
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
  };

  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      occupancy[y][x] = building.id;
    }
  }

  money -= definition.cost;
  placedBuildings.push(building);
  buildingsById.set(building.id, building);

  gameEvents.emit('money-changed', money);
  gameEvents.emit('building-placed', building);

  updateConnections();

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

  gameEvents.emit('building-removed', { building, reason });
  updateConnections();
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
 * Recomputed from scratch every tick (not persisted on the building) so that
 * placing/losing a House immediately affects staffing on the very next tick,
 * with no stale "still employed" state to invalidate.
 */
function assignWorkforce(): void {
  const houseCount = placedBuildings.filter((building) => building.type === BuildingType.House).length;
  totalPopulation = houseCount * POPULATION_PER_HOUSE;

  let available = totalPopulation;
  let employed = 0;

  for (const building of placedBuildings) {
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

    // First-come-first-served in placement order: a building's assignment is
    // capped at whatever population remains, so once the pool runs dry every
    // later building in the list gets zero workers this tick.
    const assigned = Math.min(available, workersRequired);
    building.assignedWorkers = assigned;
    building.staffed = assigned === workersRequired;
    available -= assigned;
    employed += assigned;
  }

  employedPopulation = employed;
  idlePopulation = available;
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
      revenue += soldAmount * rate.price;
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
      revenue += soldAmount * rate.price;
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
 */
function runUpkeep(): number {
  let paid = 0;

  for (const building of placedBuildings) {
    const { upkeep } = BUILDING_DEFINITIONS[building.type];
    if (upkeep <= 0 || !building.staffed) {
      building.disabled = false;
      continue;
    }

    if (money >= upkeep) {
      money = Math.round((money - upkeep) * 100) / 100;
      paid += upkeep;
      building.disabled = false;
    } else {
      building.disabled = true;
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
  const { width, height } = BUILDING_DEFINITIONS[building.type].size;
  const centerTileX = building.tileX + Math.floor(width / 2);
  const centerTileY = building.tileY + Math.floor(height / 2);

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
      continue;
    }

    // Phase 32: an unpaid (upkeep-starved) building idles exactly like an
    // understaffed one - no output, but no damage and no removal either.
    if (!building.staffed || building.disabled) {
      building.active = false;
      continue;
    }

    // Animal-owning buildings (Chicken/Pig/Cattle Farm, Cow Ranch) produce
    // nothing until stocked, regardless of staffing/inputs being satisfied.
    const animalConfig = definition.animal;
    if (animalConfig && building.animalCount === 0) {
      building.active = false;
      continue;
    }

    // Harvesters have no inputs and produce only what they can pull from
    // nearby vegetation this tick; a stripped radius means no output.
    let harvestOutputs: Partial<Record<ResourceKey, number>> | null = null;
    if (harvest) {
      harvestOutputs = runHarvest(building, harvest);
      if (!harvestOutputs) {
        building.active = false;
        continue;
      }
    }

    const inputs = production?.inputs ?? {};
    const canRun = (Object.entries(inputs) as [ResourceKey, number][]).every(
      ([key, amount]) => resources[key] >= amount,
    );

    if (!canRun) {
      building.active = false;
      continue;
    }

    for (const [key, amount] of Object.entries(inputs) as [ResourceKey, number][]) {
      resources[key] -= amount;
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
      // Only score the amount that actually fit in storage; overflow is wasted output.
      if (key === 'meat') {
        totalMeatProduced += after - before;
      }
    }
    building.active = true;
  }

  runSupermarketSales();
  runSaloonSales();

  for (const key of Object.keys(resources) as ResourceKey[]) {
    resourceTrends[key] = Math.round((resources[key] - before[key]) * 10) / 10;
  }

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
  gameEvents.emit('production-tick');
}

export function tickTimer(): void {
  if (gameOver) {
    return;
  }

  remainingSeconds -= 1;
  gameEvents.emit('timer-changed', remainingSeconds);

  if (remainingSeconds <= 0) {
    endGame();
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
export function getThreatLevel(): number {
  const elapsedFraction = 1 - Math.max(0, remainingSeconds) / GAME_DURATION_SECONDS;
  const wealthFraction = Math.min(1, computeNetWorth().total / THREAT_NET_WORTH_FULL);
  return Math.min(1, elapsedFraction * 0.5 + wealthFraction * 0.5);
}

export function getResourceTrends(): Readonly<Resources> {
  return resourceTrends;
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

function endGame(): void {
  gameOver = true;
  gameEvents.emit('game-over', {
    netWorth: computeNetWorth(),
    totalMeatProduced: Math.round(totalMeatProduced * 10) / 10,
    buildingCounts: countBuildingsByType(),
  });
}

export function resetGame(): void {
  money = STARTING_MONEY;
  Object.assign(resources, emptyResources());
  resourceTrends = emptyResources();
  totalMeatProduced = 0;
  remainingSeconds = GAME_DURATION_SECONDS;
  gameOver = false;
  totalPopulation = 0;
  employedPopulation = 0;
  idlePopulation = 0;

  placedBuildings.length = 0;
  buildingsById.clear();
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    occupancy[y].fill(null);
  }

  // Terrain is intentionally kept across a reset (the player replays the same
  // map they just learned), but vegetation is reseeded so a run that felled
  // every tree doesn't start the next one on a bald map.
  resetVegetation();

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
  gameEvents.emit('timer-changed', remainingSeconds);
  gameEvents.emit('connections-updated');
  gameEvents.emit('game-reset');
}
