import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from './constants';

export enum TileType {
  Grass = 0,
  Water = 1,
  Sand = 2,
}

// Base colors matching the pixel-art tile sprites generated in BootScene, used
// for flat-color rendering where per-pixel detail isn't needed (e.g. minimap).
export const TILE_COLORS: Record<TileType, number> = {
  [TileType.Grass]: 0x4caf50,
  [TileType.Water]: 0x2196f3,
  [TileType.Sand]: 0xd2b48c,
};

const WATER_CHANCE = 0.12;
const SAND_CHANCE = 0.1;

export function generateTileMap(): TileType[][] {
  const grid: TileType[][] = [];

  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      row.push(pickTileType());
    }
    grid.push(row);
  }

  return grid;
}

function pickTileType(): TileType {
  const roll = Math.random();
  if (roll < WATER_CHANCE) {
    return TileType.Water;
  }
  if (roll < WATER_CHANCE + SAND_CHANCE) {
    return TileType.Sand;
  }
  return TileType.Grass;
}
