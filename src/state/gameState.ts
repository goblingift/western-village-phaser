import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from '../config/constants';
import { BUILDING_DEFINITIONS, BuildingType, PlacedBuilding, ResourceKey } from '../config/buildingConfig';
import { gameEvents } from './gameEvents';

export interface Resources {
  rawMeat: number;
  meat: number;
  water: number;
}

const STARTING_MONEY = 500;

let money = STARTING_MONEY;
const resources: Resources = { rawMeat: 0, meat: 0, water: 0 };
const placedBuildings: PlacedBuilding[] = [];
const buildingsById = new Map<string, PlacedBuilding>();
const occupancy: (string | null)[][] = createEmptyOccupancy();

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

export function runProductionTick(): void {
  for (const building of placedBuildings) {
    const production = BUILDING_DEFINITIONS[building.type].production;
    if (!production) {
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
    const bonus = building.connected ? 1.1 : 1;
    for (const [key, amount] of Object.entries(production.outputs ?? {}) as [ResourceKey, number][]) {
      resources[key] += amount * bonus;
    }
    building.active = true;
  }

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
