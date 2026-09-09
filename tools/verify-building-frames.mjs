// Verifies every frame name buildingTextureKey() can produce (base state,
// House tier2/tier3, WoodenGate closed) actually exists in its OWN
// per-building atlas JSON under public/art/buildings/<BuildingType>.json
// (asset-pipeline rework, 2026-09-09 - each building now has its own
// spriteset file instead of all 37 sharing one buildings-atlas.json).
//
// Size check is deliberately NOT an exact-pixel-match against the
// footprint: building textures are rendered via `setDisplaySize()` (see
// WorldVisualsSystem.createVisualForBuilding), so a 128x128 (4x
// supersampled) or a 32x32 (1x, e.g. an untouched placeholder) source both
// render correctly at the same on-screen tile footprint - source resolution
// is decoupled from footprint by design. What WOULD still break the game:
// (a) a frame whose size isn't a clean integer multiple of its building's
// footprint aspect ratio (a distorted/stretched sprite), or (b) two frames
// of the SAME building at different resolutions (a damage-state swap or
// tier upgrade would visibly snap to a different apparent scale, since
// Phaser's Image keeps whatever scaleX/scaleY setDisplaySize computed for
// the frame present at creation time rather than recomputing it on
// setFrame()/setTexture() - see resolveBuildingTexture's doc comment).
// Both of those are exactly what's checked below.
//
// Usage: node tools/verify-building-frames.mjs
// Exit code 0 = every building's atlas file exists with every expected frame
// at the correct size (real building art beyond the required "Intact"/base
// frame is optional - Damaged/Ruined/Construction*/Tier* frames are checked
// ONLY if present, never required, since real generation lands one building
// and one state at a time).
// Exit code 1 = a building's atlas file is missing entirely, or an expected
// frame is missing/wrong-size, or a present-but-nonstandard frame is the
// wrong size for its declared dimensions.
//
// Mirrors tools/generate-placeholder-buildings.mjs's hand-transcribed
// BUILDING_SIZES table - if a building is added, removed, or resized, BOTH
// files need updating together.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TILE_SIZE = 32;

// type -> { w, h } in tiles. Mirrors buildingConfig.ts's BUILDING_DEFINITIONS
// size fields exactly (34 entries).
const BUILDING_SIZES = {
  OstrichFarm: { w: 2, h: 2 },
  Butcher: { w: 2, h: 2 },
  Well: { w: 1, h: 1 },
  House: { w: 1, h: 1 },
  Road: { w: 1, h: 1 },
  ChickenFarm: { w: 1, h: 1 },
  PigFarm: { w: 2, h: 2 },
  CowRanch: { w: 2, h: 2 },
  Fence: { w: 1, h: 1 },
  Gate: { w: 1, h: 1 },
  WoodenWall: { w: 1, h: 1 },
  WoodenGate: { w: 1, h: 1 },
  Warehouse: { w: 2, h: 2 },
  Granary: { w: 1, h: 1 },
  Supermarket: { w: 2, h: 2 },
  Barracks: { w: 2, h: 2 },
  Sewery: { w: 2, h: 2 },
  Forestry: { w: 2, h: 2 },
  WoodCutter: { w: 2, h: 2 },
  PotatoField: { w: 2, h: 2 },
  Liquor: { w: 2, h: 2 },
  Saloon: { w: 2, h: 2 },
  Horsery: { w: 2, h: 2 },
  Bank: { w: 2, h: 2 },
  CactusMilker: { w: 2, h: 2 },
  Watchtower: { w: 1, h: 1 },
  Quarry: { w: 2, h: 2 },
  IronMine: { w: 2, h: 2 },
  CoalMine: { w: 2, h: 2 },
  Blacksmith: { w: 2, h: 2 },
  TradingPost: { w: 2, h: 2 },
  WaterTower: { w: 1, h: 1 },
  Church: { w: 2, h: 2 },
  Brothel: { w: 2, h: 2 },
};

const expectedTypeCount = 34;
const typeNames = Object.keys(BUILDING_SIZES);
if (typeNames.length !== expectedTypeCount) {
  console.error(
    `[FAIL] BUILDING_SIZES table has ${typeNames.length} entries, expected ${expectedTypeCount}. ` +
      'Update this script (and generate-placeholder-buildings.mjs) to match buildingConfig.ts.',
  );
  process.exit(1);
}

/** Mirrors buildingTextureKey(type, tier, gateOpen) from buildingConfig.ts - note the
 * RETURN VALUE no longer includes a `building-${type}` prefix (the atlas itself is
 * now scoped to one building type, so that prefix would be redundant). */
function buildingTextureKey(type, tier, gateOpen) {
  if (type === 'House' && tier && tier > 1) {
    return `Tier${tier}`;
  }
  if (type === 'WoodenGate' && gateOpen === false) {
    return 'Closed';
  }
  return 'Intact';
}

// Every REQUIRED frame name per type (base state, plus House/WoodenGate's
// extra base-state variants) - every other building only requires 'Intact'.
function requiredFrameNamesForType(type) {
  const names = [buildingTextureKey(type)];
  if (type === 'House') {
    names.push(buildingTextureKey(type, 2), buildingTextureKey(type, 3));
  }
  if (type === 'WoodenGate') {
    names.push(buildingTextureKey(type, undefined, false));
  }
  return names;
}

function main() {
  let failed = false;
  let totalRequiredChecked = 0;
  let totalFramesChecked = 0;

  for (const [type, size] of Object.entries(BUILDING_SIZES)) {
    const pngPath = join(repoRoot, 'public/art/buildings', `${type}.png`);
    const jsonPath = join(repoRoot, 'public/art/buildings', `${type}.json`);

    if (!existsSync(pngPath)) {
      console.error(`[FAIL] public/art/buildings/${type}.png does not exist.`);
      failed = true;
      continue;
    }
    if (!existsSync(jsonPath)) {
      console.error(`[FAIL] public/art/buildings/${type}.json does not exist.`);
      failed = true;
      continue;
    }

    let atlas;
    try {
      atlas = JSON.parse(readFileSync(jsonPath, 'utf8'));
    } catch (error) {
      console.error(`[FAIL] Could not parse public/art/buildings/${type}.json as JSON: ${error.message}`);
      failed = true;
      continue;
    }

    const frames = atlas.frames ?? {};
    let buildingFailed = false;

    // (1) every required frame name is present.
    const requiredNames = requiredFrameNamesForType(type);
    for (const name of requiredNames) {
      totalRequiredChecked++;
      if (!frames[name]) {
        console.error(`[FAIL] ${type}.json: missing required frame "${name}".`);
        failed = true;
        buildingFailed = true;
      }
    }

    // (2) every present frame's aspect ratio matches this building's real
    // footprint (size.w : size.h) - catches a distorted/stretched sprite,
    // independent of absolute resolution.
    let referenceSize = null; // (3) every frame is the SAME size as every other for this building.
    for (const [name, data] of Object.entries(frames)) {
      totalFramesChecked++;
      const { w, h } = data.frame ?? {};
      if (!w || !h) {
        console.error(`[FAIL] ${type}.json: frame "${name}" has no valid frame.w/frame.h.`);
        failed = true;
        buildingFailed = true;
        continue;
      }
      if (w * size.h !== h * size.w) {
        console.error(
          `[FAIL] ${type}.json: frame "${name}" is ${w}x${h}px, which isn't ${size.w}:${size.h} aspect ratio ` +
            `(${type}'s real footprint) - looks stretched/distorted.`,
        );
        failed = true;
        buildingFailed = true;
      }
      if (referenceSize === null) {
        referenceSize = { w, h, name };
      } else if (w !== referenceSize.w || h !== referenceSize.h) {
        console.error(
          `[FAIL] ${type}.json: frame "${name}" is ${w}x${h}px but frame "${referenceSize.name}" (same building) ` +
            `is ${referenceSize.w}x${referenceSize.h}px - every state frame for one building must render at the ` +
            'SAME resolution, or swapping between them (e.g. a damage-state change) will visibly snap to a ' +
            "different on-screen size (Phaser's setDisplaySize-derived scale is fixed at sprite-creation time, " +
            'not recomputed on setFrame()/setTexture()).',
        );
        failed = true;
        buildingFailed = true;
      }
    }

    if (!buildingFailed) {
      console.log(`[OK]   ${type}.json: ${Object.keys(frames).length} frame(s) at ${referenceSize.w}x${referenceSize.h}px, all present/consistent.`);
    }
  }

  console.log(`\nChecked ${typeNames.length} building atlases: ${totalRequiredChecked} required frame-name checks, ${totalFramesChecked} frames size/consistency-verified.`);

  if (failed) {
    console.error('\nBuilding frame-name verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('Building frame-name verification passed.');
}

main();
