import { RaiderFaction } from '../config/buildingConfig';

/**
 * Phase 57: Raider Camps (Offense Phase). A camp is a persistent hostile
 * structure - not a PlacedBuilding (the player never owns or builds one) -
 * that acts as a standing, attackable source of raid waves instead of raids
 * simply appearing out of nowhere at a random map edge. Deliberately as
 * lightweight as vegetation.ts's VegetationEntity: a plain id/position/hp
 * record with no terrain-generation/AI of its own, and (like vegetation.ts)
 * this module never imports gameState - MainScene owns every camp's sprite
 * and the wave-sending timer it piggybacks onto scheduleNextRaidCheck for;
 * this module is only the single source of truth for "does this camp still
 * exist, and how much HP does it have left" so combat
 * (MainScene.resolveCowboyFire's camp-damage branch) and persistence
 * (state/persistence.ts) both read/write one place, exactly like a
 * PlacedBuilding's own hp field.
 *
 * x/y are world pixels (not tileX/tileY) because a camp never moves and is
 * otherwise treated like a static Raider - MainScene divides by TILE_SIZE
 * itself wherever it needs a tile-space reading (e.g. the minimap dot),
 * mirroring how Raider.image.x/y is already read the same way.
 */
export interface RaiderCamp {
  id: string;
  x: number;
  y: number;
  faction: RaiderFaction;
  hp: number;
  maxHp: number;
}

let camps: RaiderCamp[] = [];
let nextCampId = 0;

export function getRaiderCamps(): readonly RaiderCamp[] {
  return camps;
}

export function getRaiderCampById(id: string): RaiderCamp | null {
  return camps.find((camp) => camp.id === id) ?? null;
}

export function spawnRaiderCamp(x: number, y: number, faction: RaiderFaction, maxHp: number): RaiderCamp {
  const camp: RaiderCamp = { id: `camp-${nextCampId++}`, x, y, faction, hp: maxHp, maxHp };
  camps.push(camp);
  return camp;
}

/**
 * Floored-at-0 damage application, mirroring PlacedBuilding.hp's convention
 * (resolveRaiderAttacks/resolveCowboyFire in MainScene already write
 * building.hp directly the same way). Returns the camp's remaining hp, or
 * null if it was already gone (e.g. two shots landing in the same combat
 * tick after the first one killed it).
 */
export function damageRaiderCamp(id: string, amount: number): number | null {
  const camp = getRaiderCampById(id);
  if (!camp) {
    return null;
  }
  camp.hp = Math.max(0, camp.hp - amount);
  return camp.hp;
}

export function removeRaiderCamp(id: string): void {
  const index = camps.findIndex((camp) => camp.id === id);
  if (index >= 0) {
    camps.splice(index, 1);
  }
}

/** Called from gameState.resetGame(), mirroring resetVegetation()'s spot in that same function - a fresh run never inherits the previous one's camps. */
export function resetRaiderCamps(): void {
  camps = [];
  nextCampId = 0;
}

/** Phase 52-style persistence pair (see persistence.ts) - a plain-data snapshot/restore, same shape as vegetation.ts's serializeVegetation/restoreVegetationEntities. */
export type RaiderCampSaveState = RaiderCamp;

export function serializeRaiderCamps(): RaiderCampSaveState[] {
  return camps.map((camp) => ({ ...camp }));
}

/** The inverse of serializeRaiderCamps - replaces the whole list wholesale (a load resumes the loaded camps, not a merge with whatever was just reset in). nextCampId is re-derived from the highest restored id so a subsequent spawnRaiderCamp() can never mint a colliding id. */
export function restoreRaiderCamps(saved: readonly RaiderCampSaveState[]): void {
  camps = saved.map((camp) => ({ ...camp }));
  nextCampId = 0;
  for (const camp of camps) {
    const idNumber = Number(camp.id.split('-')[1]);
    if (Number.isFinite(idNumber) && idNumber >= nextCampId) {
      nextCampId = idNumber + 1;
    }
  }
}
