import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from './constants';

/**
 * Phase 30: the map is a dry Western basin, not a meadow. The three ground
 * variants (Dirt/Gravel/Sand) are all buildable and differ only cosmetically;
 * Water is the single impassable/unbuildable terrain. Enum values double as
 * tilemap frame indices (see BootScene.TILE_SPRITES), so the order here and
 * the order of the sprite list must stay in sync.
 */
export enum TileType {
  Dirt = 0,
  Gravel = 1,
  Sand = 2,
  Water = 3,
}

// Base colors matching the pixel-art tile sprites generated in BootScene, used
// for flat-color rendering where per-pixel detail isn't needed (e.g. minimap).
export const TILE_COLORS: Record<TileType, number> = {
  [TileType.Dirt]: 0x9c7b52,
  [TileType.Gravel]: 0x8a8172,
  [TileType.Sand]: 0xd2b48c,
  [TileType.Water]: 0x2f7fbf,
};

/** Everything that isn't Water; a building may only occupy these. */
const GROUND_TYPES: readonly TileType[] = [TileType.Dirt, TileType.Gravel, TileType.Sand];

/**
 * Ground variants are painted as overlapping blobs rather than rolled
 * per-tile (pre-Phase-30 behaviour), so gravel and sand read as patches of
 * terrain instead of uniform noise.
 */
const PATCH_COUNT = 30;
const PATCH_RADIUS_MIN = 2;
const PATCH_RADIUS_MAX = 5;

/**
 * Water target is ~3-5% of the map, split between a handful of grown lake
 * blobs and one meandering river. Both are grown/walked rather than sampled
 * per-tile so the result is connected water a Well can actually sit beside.
 */
const LAKE_COUNT_MIN = 2;
const LAKE_COUNT_MAX = 4;
const LAKE_SIZE_MIN = 6;
const LAKE_SIZE_MAX = 14;
const RIVER_FORWARD_BIAS = 0.7;
const RIVER_WIDEN_CHANCE = 0.35;

function inBounds(tileX: number, tileY: number): boolean {
  return tileX >= 0 && tileY >= 0 && tileX < MAP_WIDTH_TILES && tileY < MAP_HEIGHT_TILES;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(values: readonly T[]): T {
  return values[randomInt(0, values.length - 1)];
}

/** Dirt base with overlapping circular gravel/sand patches stamped on top. */
function paintGround(grid: TileType[][]): void {
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      grid[y][x] = TileType.Dirt;
    }
  }

  for (let patch = 0; patch < PATCH_COUNT; patch++) {
    const type = pick(GROUND_TYPES);
    const centerX = randomInt(0, MAP_WIDTH_TILES - 1);
    const centerY = randomInt(0, MAP_HEIGHT_TILES - 1);
    const radius = randomInt(PATCH_RADIUS_MIN, PATCH_RADIUS_MAX);

    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        if (!inBounds(x, y)) {
          continue;
        }
        const dx = x - centerX;
        const dy = y - centerY;
        // Ragged edge: tiles right at the rim only sometimes take the patch
        // type, so patches don't read as perfect circles.
        if (dx * dx + dy * dy > radius * radius || (dx * dx + dy * dy > (radius - 1) ** 2 && Math.random() < 0.5)) {
          continue;
        }
        grid[y][x] = type;
      }
    }
  }
}

/**
 * Frontier growth from a single seed: repeatedly flood one random tile
 * adjacent to the blob so far. Produces an irregular, always-connected lake
 * rather than a disc.
 */
function growLake(grid: TileType[][], seedX: number, seedY: number, size: number): void {
  const frontier: [number, number][] = [[seedX, seedY]];

  for (let placed = 0; placed < size && frontier.length > 0; placed++) {
    const index = randomInt(0, frontier.length - 1);
    const [x, y] = frontier.splice(index, 1)[0];
    if (!inBounds(x, y) || grid[y][x] === TileType.Water) {
      placed -= 1;
      continue;
    }

    grid[y][x] = TileType.Water;
    frontier.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

/**
 * Random walk from one map edge toward the opposite one, mostly stepping
 * forward (RIVER_FORWARD_BIAS) and otherwise drifting sideways, occasionally
 * widening to two tiles so the river doesn't read as a 1px line.
 */
function carveRiver(grid: TileType[][]): void {
  const horizontal = Math.random() < 0.5;
  let x = horizontal ? 0 : randomInt(0, MAP_WIDTH_TILES - 1);
  let y = horizontal ? randomInt(0, MAP_HEIGHT_TILES - 1) : 0;

  const maxSteps = horizontal ? MAP_WIDTH_TILES * 2 : MAP_HEIGHT_TILES * 2;

  for (let step = 0; step < maxSteps; step++) {
    if (!inBounds(x, y)) {
      return;
    }
    grid[y][x] = TileType.Water;
    if (Math.random() < RIVER_WIDEN_CHANCE) {
      const sideX = horizontal ? x : x + 1;
      const sideY = horizontal ? y + 1 : y;
      if (inBounds(sideX, sideY)) {
        grid[sideY][sideX] = TileType.Water;
      }
    }

    if (Math.random() < RIVER_FORWARD_BIAS) {
      if (horizontal) {
        x += 1;
      } else {
        y += 1;
      }
    } else if (horizontal) {
      y += Math.random() < 0.5 ? 1 : -1;
    } else {
      x += Math.random() < 0.5 ? 1 : -1;
    }
  }
}

export function generateTileMap(): TileType[][] {
  const grid: TileType[][] = [];
  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    grid.push(new Array<TileType>(MAP_WIDTH_TILES).fill(TileType.Dirt));
  }

  paintGround(grid);

  const lakes = randomInt(LAKE_COUNT_MIN, LAKE_COUNT_MAX);
  for (let lake = 0; lake < lakes; lake++) {
    growLake(
      grid,
      randomInt(2, MAP_WIDTH_TILES - 3),
      randomInt(2, MAP_HEIGHT_TILES - 3),
      randomInt(LAKE_SIZE_MIN, LAKE_SIZE_MAX),
    );
  }

  carveRiver(grid);

  return grid;
}

/**
 * The generated terrain is module state rather than a MainScene local (as it
 * was pre-Phase-30) because gameState now has to consult it on every
 * placement check, and gameState must not depend on the scene. Regenerated
 * only on an explicit reset request, so a mid-session lookup is always
 * against the same map the player is looking at.
 */
let worldTiles: TileType[][] = generateTileMap();

export function getWorldTiles(): readonly TileType[][] {
  return worldTiles;
}

export function regenerateWorldTiles(): TileType[][] {
  worldTiles = generateTileMap();
  return worldTiles;
}

export function getTileTypeAt(tileX: number, tileY: number): TileType | null {
  return inBounds(tileX, tileY) ? worldTiles[tileY][tileX] : null;
}

export function isWaterTile(tileX: number, tileY: number): boolean {
  return getTileTypeAt(tileX, tileY) === TileType.Water;
}

/** In-bounds, non-water ground. Vegetation is checked separately (state/vegetation.ts). */
export function isBuildableTerrain(tileX: number, tileY: number): boolean {
  const type = getTileTypeAt(tileX, tileY);
  return type !== null && type !== TileType.Water;
}

/**
 * Chebyshev distance in tiles from a footprint to the nearest water tile,
 * searched outward only as far as maxDistance (Wells are the sole caller and
 * only care about a 3-tile band), returning null when none is in range.
 */
export function distanceToNearestWater(
  tileX: number,
  tileY: number,
  width: number,
  height: number,
  maxDistance: number,
): number | null {
  for (let distance = 1; distance <= maxDistance; distance++) {
    for (let y = tileY - distance; y < tileY + height + distance; y++) {
      for (let x = tileX - distance; x < tileX + width + distance; x++) {
        const insideX = x >= tileX - distance + 1 && x < tileX + width + distance - 1;
        const insideY = y >= tileY - distance + 1 && y < tileY + height + distance - 1;
        // Only the newly-added ring is examined each pass; inner rings were
        // already covered by a previous (smaller) distance.
        if (insideX && insideY) {
          continue;
        }
        if (isWaterTile(x, y)) {
          return distance;
        }
      }
    }
  }
  return null;
}
