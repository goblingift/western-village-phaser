import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from '../config/constants';
import { BUILDING_DEFINITIONS, BuildingType, PlacedBuilding } from '../config/buildingConfig';
import { gameEvents } from './gameEvents';

const STARTING_MONEY = 500;

let money = STARTING_MONEY;
const placedBuildings: PlacedBuilding[] = [];
const occupancy: boolean[][] = createEmptyOccupancy();

function createEmptyOccupancy(): boolean[][] {
  const grid: boolean[][] = [];
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    grid.push(new Array(MAP_WIDTH_TILES).fill(false));
  }
  return grid;
}

export function getMoney(): number {
  return money;
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
      if (occupancy[y][x]) {
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

  for (let y = tileY; y < tileY + height; y++) {
    for (let x = tileX; x < tileX + width; x++) {
      occupancy[y][x] = true;
    }
  }

  money -= definition.cost;

  const building: PlacedBuilding = {
    id: `${type}-${tileX}-${tileY}-${Date.now()}`,
    type,
    tileX,
    tileY,
  };
  placedBuildings.push(building);

  gameEvents.emit('money-changed', money);
  gameEvents.emit('building-placed', building);

  return building;
}
