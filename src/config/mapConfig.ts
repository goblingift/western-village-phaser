import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from './constants';

export enum TileType {
  Grass = 0,
  Water = 1,
  Sand = 2,
}

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
