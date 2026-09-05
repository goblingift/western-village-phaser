import {
  BASE_STORAGE_CAP,
  GAME_DURATION_SECONDS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  POPULATION_PER_HOUSE,
  WAREHOUSE_STORAGE_BONUS,
} from '../config/constants';
import {
  BUILDING_DEFINITIONS,
  BuildingType,
  PlacedBuilding,
  ResourceKey,
  SUPERMARKET_SELL_RATES,
  getWorkersRequired,
} from '../config/buildingConfig';
import { gameEvents } from './gameEvents';

export interface Resources {
  rawMeat: number;
  meat: number;
  water: number;
  eggs: number;
}

export interface GameOverSummary {
  totalMeatProduced: number;
  buildingCounts: Record<BuildingType, number>;
}

const STARTING_MONEY = 500;

let money = STARTING_MONEY;
const resources: Resources = { rawMeat: 0, meat: 0, water: 0, eggs: 0 };
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

export function canPlaceBuilding(tileX: number, tileY: number, type: BuildingType): boolean {
  return (
    isWithinBounds(tileX, tileY, type) && isAreaFree(tileX, tileY, type) && canAfford(type)
  );
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

export function getStorageCap(): number {
  const staffedWarehouses = placedBuildings.filter(
    (building) => building.type === BuildingType.Warehouse && building.staffed,
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
      building.lastSale = { meat: 0, eggs: 0, revenue: 0 };
      continue;
    }

    const soldMeat = Math.min(SUPERMARKET_SELL_RATES.meat.amount, resources.meat);
    const soldEggs = Math.min(SUPERMARKET_SELL_RATES.eggs.amount, resources.eggs);
    resources.meat -= soldMeat;
    resources.eggs -= soldEggs;

    const revenue = soldMeat * SUPERMARKET_SELL_RATES.meat.price + soldEggs * SUPERMARKET_SELL_RATES.eggs.price;
    money += revenue;

    building.lastSale = { meat: soldMeat, eggs: soldEggs, revenue };
    building.active = soldMeat > 0 || soldEggs > 0;
  }
}

export function runProductionTick(): void {
  if (gameOver) {
    return;
  }

  assignWorkforce();
  const storageCap = getStorageCap();

  for (const building of placedBuildings) {
    const production = BUILDING_DEFINITIONS[building.type].production;
    if (!production) {
      building.active = false;
      continue;
    }

    if (!building.staffed) {
      building.active = false;
      continue;
    }

    const inputs = production.inputs ?? {};
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
    // Cow Ranch needs an adjacent Fence tile to reach full output; without one it runs at half rate.
    const fenceMultiplier = production.requiresFence && !hasAdjacentFence(building) ? 0.5 : 1;
    const bonus = (building.connected ? 1.1 : 1) * fenceMultiplier;
    for (const [key, amount] of Object.entries(production.outputs ?? {}) as [ResourceKey, number][]) {
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

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
  gameEvents.emit('production-tick');

  const activeCount = placedBuildings.filter((b) => b.active).length;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  console.log(
    '[tick]',
    { money, rawMeat: round1(resources.rawMeat), meat: round1(resources.meat), water: round1(resources.water) },
    `${activeCount}/${placedBuildings.length} buildings active`,
  );
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
    totalMeatProduced: Math.round(totalMeatProduced * 10) / 10,
    buildingCounts: countBuildingsByType(),
  });
}

export function resetGame(): void {
  money = STARTING_MONEY;
  resources.rawMeat = 0;
  resources.meat = 0;
  resources.water = 0;
  resources.eggs = 0;
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

  gameEvents.emit('money-changed', money);
  gameEvents.emit('resources-changed', { ...resources });
  gameEvents.emit('timer-changed', remainingSeconds);
  gameEvents.emit('connections-updated');
  gameEvents.emit('game-reset');
}
