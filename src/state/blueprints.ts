import { BuildingType } from '../config/buildingConfig';

/**
 * Phase 88: Blueprint Copy-Paste.
 *
 * A small, standalone localStorage-backed store of named building layouts,
 * following records.ts's/prestige.ts's exact pattern: its own versioned key,
 * every read/write wrapped against every browser failure mode (storage
 * disabled/full in private mode, a corrupt or foreign value, a future
 * version), degrading to "no blueprints" rather than throwing into the
 * placement UI. It never imports gameState - InputSystem hands this module a
 * plain list of {tileX, tileY, type} it already scanned out of
 * getPlacedBuildings() and gets back tile OFFSETS, keeping this module a pure
 * data store with no knowledge of the live map.
 */

/** Bumped only if the stored shape changes incompatibly; a mismatch is discarded rather than migrated (a lost blueprint library is a cosmetic loss, unlike a lost savegame). */
const BLUEPRINTS_VERSION = 1;

/** Matches persistence.ts's `western-village-save-` / records.ts's `western-village-records` prefix convention. */
const BLUEPRINTS_STORAGE_KEY = 'western-village-blueprints';

/** Reasonable cap to keep localStorage usage bounded - a save past this count is rejected outright (see saveBlueprint's return value) rather than silently evicting an older one. */
export const MAX_STORED_BLUEPRINTS = 20;

/** One captured building, positioned relative to the copy-rectangle's top-left tile - NOT an absolute map coordinate, so a blueprint can be pasted anywhere. */
export interface BlueprintTile {
  dxTile: number;
  dyTile: number;
  type: BuildingType;
}

export interface Blueprint {
  id: string;
  name: string;
  tiles: BlueprintTile[];
  /** For display in the manage/picker UI only - never used for placement logic. */
  createdAtMs: number;
}

interface BlueprintsSaveState {
  version: number;
  blueprints: Blueprint[];
}

/** The result of a save attempt - saveBlueprint never silently drops a blueprint past the cap, it reports why. */
export type SaveBlueprintResult =
  | { ok: true; blueprint: Blueprint }
  | { ok: false; reason: string };

let blueprintIdCounter = 0;

function readStore(): Blueprint[] {
  try {
    const raw = localStorage.getItem(BLUEPRINTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as BlueprintsSaveState;
    if (!parsed || parsed.version !== BLUEPRINTS_VERSION || !Array.isArray(parsed.blueprints)) {
      return [];
    }
    return parsed.blueprints;
  } catch {
    return [];
  }
}

function writeStore(blueprints: Blueprint[]): boolean {
  try {
    const payload: BlueprintsSaveState = { version: BLUEPRINTS_VERSION, blueprints };
    localStorage.setItem(BLUEPRINTS_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Storage unavailable/full - the caller (saveBlueprint) reports this to
    // the player rather than pretending the save succeeded.
    return false;
  }
}

/** Every stored blueprint, newest first - the picker/manage list's source of truth. */
export function listBlueprints(): Blueprint[] {
  return [...readStore()].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function getBlueprintById(id: string): Blueprint | null {
  return readStore().find((blueprint) => blueprint.id === id) ?? null;
}

/**
 * Saves a newly captured set of relative tiles under `name`. Rejects (rather
 * than evicting an older blueprint) once the store is already at
 * MAX_STORED_BLUEPRINTS, and rejects an empty capture outright - both are
 * reported back via the discriminated result instead of a silent no-op.
 */
export function saveBlueprint(name: string, tiles: BlueprintTile[]): SaveBlueprintResult {
  if (tiles.length === 0) {
    return { ok: false, reason: 'Nothing to save - the selection had no buildings in it.' };
  }

  const store = readStore();
  if (store.length >= MAX_STORED_BLUEPRINTS) {
    return {
      ok: false,
      reason: `Blueprint limit reached (${MAX_STORED_BLUEPRINTS}). Delete one first.`,
    };
  }

  const trimmedName = name.trim();
  const blueprint: Blueprint = {
    id: `bp-${Date.now()}-${blueprintIdCounter++}`,
    name: trimmedName.length > 0 ? trimmedName : 'Untitled Blueprint',
    tiles,
    createdAtMs: Date.now(),
  };

  store.push(blueprint);
  if (!writeStore(store)) {
    return { ok: false, reason: 'Could not save - browser storage is unavailable or full.' };
  }
  return { ok: true, blueprint };
}

export function renameBlueprint(id: string, newName: string): boolean {
  const store = readStore();
  const blueprint = store.find((entry) => entry.id === id);
  if (!blueprint) {
    return false;
  }
  const trimmed = newName.trim();
  if (trimmed.length === 0) {
    return false;
  }
  blueprint.name = trimmed;
  return writeStore(store);
}

export function deleteBlueprint(id: string): boolean {
  const store = readStore();
  const next = store.filter((entry) => entry.id !== id);
  if (next.length === store.length) {
    return false;
  }
  return writeStore(next);
}
