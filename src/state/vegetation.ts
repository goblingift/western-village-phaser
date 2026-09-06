import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from '../config/constants';
import { getTileTypeAt } from '../config/mapConfig';
import {
  VEGETATION_DEFINITIONS,
  VegetationKind,
} from '../config/vegetationConfig';
import { gameEvents } from './gameEvents';

/**
 * Phase 30: a single tree or cactus standing on one tile. `remainingYield`
 * is what harvesting buildings (Forestry, Cactus Milker) draw down; the
 * entity is removed once it hits zero, which is what makes over-harvesting a
 * real, visible consequence rather than an infinite resource faucet.
 *
 * This module deliberately knows nothing about buildings: gameState imports
 * it (for placement blocking and harvesting), never the other way round, so
 * there is no cycle. Anything needing building occupancy - e.g. picking a
 * free tile to replant on - takes it as a caller-supplied predicate.
 */
export interface VegetationEntity {
  id: string;
  kind: VegetationKind;
  tileX: number;
  tileY: number;
  remainingYield: number;
}

let vegetation: VegetationEntity[] = [];
const vegetationByTile = new Map<string, VegetationEntity>();
let nextVegetationId = 0;

function tileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function canGrowAt(kind: VegetationKind, tileX: number, tileY: number): boolean {
  const type = getTileTypeAt(tileX, tileY);
  if (type === null) {
    return false;
  }
  if (vegetationByTile.has(tileKey(tileX, tileY))) {
    return false;
  }
  return VEGETATION_DEFINITIONS[kind].terrain.includes(type);
}

function addVegetation(kind: VegetationKind, tileX: number, tileY: number): VegetationEntity {
  const entity: VegetationEntity = {
    id: `veg-${nextVegetationId++}`,
    kind,
    tileX,
    tileY,
    remainingYield: VEGETATION_DEFINITIONS[kind].maxYield,
  };
  vegetation.push(entity);
  vegetationByTile.set(tileKey(tileX, tileY), entity);
  return entity;
}

/** Seeds the whole map from scratch; called once at startup and again on game-reset. */
export function generateVegetation(): void {
  vegetation = [];
  vegetationByTile.clear();

  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      for (const definition of Object.values(VEGETATION_DEFINITIONS)) {
        if (Math.random() < definition.density && canGrowAt(definition.kind, x, y)) {
          addVegetation(definition.kind, x, y);
          break;
        }
      }
    }
  }
}

export function getVegetation(): readonly VegetationEntity[] {
  return vegetation;
}

export function getVegetationAtTile(tileX: number, tileY: number): VegetationEntity | null {
  return vegetationByTile.get(tileKey(tileX, tileY)) ?? null;
}

/** Placement gate: any tile carrying a tree/cactus is unbuildable until it's cleared by harvesting. */
export function isTileBlockedByVegetation(tileX: number, tileY: number): boolean {
  return vegetationByTile.has(tileKey(tileX, tileY));
}

export function countVegetationInRadius(
  kind: VegetationKind,
  centerTileX: number,
  centerTileY: number,
  radiusTiles: number,
): number {
  let count = 0;
  for (const entity of vegetation) {
    if (entity.kind !== kind) {
      continue;
    }
    if (
      Math.abs(entity.tileX - centerTileX) <= radiusTiles &&
      Math.abs(entity.tileY - centerTileY) <= radiusTiles
    ) {
      count += 1;
    }
  }
  return count;
}

/** Nearest (squared-distance) matching entity inside a square radius, or null when the area is exhausted. */
export function findNearestVegetation(
  kind: VegetationKind,
  centerTileX: number,
  centerTileY: number,
  radiusTiles: number,
): VegetationEntity | null {
  let best: VegetationEntity | null = null;
  let bestDistance = Infinity;

  for (const entity of vegetation) {
    if (entity.kind !== kind) {
      continue;
    }
    const dx = entity.tileX - centerTileX;
    const dy = entity.tileY - centerTileY;
    if (Math.abs(dx) > radiusTiles || Math.abs(dy) > radiusTiles) {
      continue;
    }
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entity;
    }
  }

  return best;
}

/**
 * Draws down an entity's yield and returns how much was actually taken
 * (which can be less than requested near exhaustion). The entity is removed -
 * and 'vegetation-removed' emitted so its sprite goes away - the moment its
 * yield reaches zero.
 */
export function harvestVegetation(entity: VegetationEntity, amount: number): number {
  const taken = Math.min(amount, entity.remainingYield);
  entity.remainingYield -= taken;

  if (entity.remainingYield <= 0) {
    removeVegetation(entity);
  }

  return taken;
}

export function removeVegetation(entity: VegetationEntity): void {
  const index = vegetation.indexOf(entity);
  if (index >= 0) {
    vegetation.splice(index, 1);
  }
  vegetationByTile.delete(tileKey(entity.tileX, entity.tileY));
  gameEvents.emit('vegetation-removed', entity);
}

/**
 * Forestry's replanting (Phase 32). Scans a shuffled set of candidate tiles
 * inside the radius and plants on the first one that is both growable terrain
 * and free of buildings - the latter tested through a caller-supplied
 * predicate so this module never has to import gameState.
 */
export function plantVegetation(
  kind: VegetationKind,
  centerTileX: number,
  centerTileY: number,
  radiusTiles: number,
  isTileFree: (tileX: number, tileY: number) => boolean,
): VegetationEntity | null {
  const candidates: [number, number][] = [];
  for (let y = centerTileY - radiusTiles; y <= centerTileY + radiusTiles; y++) {
    for (let x = centerTileX - radiusTiles; x <= centerTileX + radiusTiles; x++) {
      if (canGrowAt(kind, x, y) && isTileFree(x, y)) {
        candidates.push([x, y]);
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const [tileX, tileY] = candidates[Math.floor(Math.random() * candidates.length)];
  const entity = addVegetation(kind, tileX, tileY);
  gameEvents.emit('vegetation-added', entity);
  return entity;
}

export function resetVegetation(): void {
  generateVegetation();
}

/** Phase 52: plain-data snapshot of every live entity, for a save payload - see persistence.ts. */
export function serializeVegetation(): VegetationEntity[] {
  return vegetation.map((entity) => ({ ...entity }));
}

/**
 * Phase 52: the inverse of serializeVegetation. Replaces the whole entity
 * list/index wholesale (rather than diffing against the current map) - called
 * once, right after gameState's resetGame() has already reseeded a fresh
 * random layout via resetVegetation(), so that random layout is discarded in
 * favor of the loaded one. `nextVegetationId` is re-derived from the highest
 * restored id so a subsequent plantVegetation() (Forestry replanting) can
 * never mint a colliding id.
 */
export function restoreVegetationEntities(entities: readonly VegetationEntity[]): void {
  vegetation = entities.map((entity) => ({ ...entity }));
  vegetationByTile.clear();
  nextVegetationId = 0;

  for (const entity of vegetation) {
    vegetationByTile.set(tileKey(entity.tileX, entity.tileY), entity);
    const idNumber = Number(entity.id.split('-')[1]);
    if (Number.isFinite(idNumber) && idNumber >= nextVegetationId) {
      nextVegetationId = idNumber + 1;
    }
  }
}

generateVegetation();
