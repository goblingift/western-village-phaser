// Phase 74 (buildings): verifies every frame name buildingTextureKey() can
// produce (for every BuildingType, every relevant House tier, and both
// WoodenGate open/closed states) actually exists in
// public/art/buildings-atlas.json, AND that each frame's packed rectangle in
// the JSON matches its expected pixel size (derived from the building's own
// footprint * TILE_SIZE - 32x32 for 1x1, 64x64 for 2x2 - never hardcoded per
// building). This is a separate, narrower check from
// tools/verify-asset-dimensions.mjs (which only checks whole-PNG-file
// dimensions) - an atlas PNG's overall size passing says nothing about
// whether any individual packed frame is the right size or even present.
//
// Usage: node tools/verify-building-frames.mjs
// Exit code 0 = every expected frame exists with the correct size.
// Exit code 1 = at least one frame is missing or the wrong size.
//
// Mirrors tools/generate-placeholder-buildings.mjs's hand-transcribed
// BUILDING_TYPES/size table (see that file's own doc comment for why this
// can't just import buildingConfig.ts directly) - if a building is added,
// removed, or resized, BOTH files need updating together.

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

/** Mirrors buildingTextureKey(type, tier, gateOpen) from buildingConfig.ts. */
function buildingTextureKey(type, tier, gateOpen) {
  if (type === 'House' && tier && tier > 1) {
    return `building-${type}-tier${tier}`;
  }
  if (type === 'WoodenGate' && gateOpen === false) {
    return `building-${type}-closed`;
  }
  return `building-${type}`;
}

// Every frame name + expected size the running game can actually request.
const expectedFrames = [];
for (const [type, size] of Object.entries(BUILDING_SIZES)) {
  expectedFrames.push({
    name: buildingTextureKey(type),
    width: size.w * TILE_SIZE,
    height: size.h * TILE_SIZE,
    note: `${type} base frame`,
  });
}
// House tier2/tier3 (buildingTextureKey ignores tier for every other type).
expectedFrames.push({
  name: buildingTextureKey('House', 2),
  width: BUILDING_SIZES.House.w * TILE_SIZE,
  height: BUILDING_SIZES.House.h * TILE_SIZE,
  note: 'House tier 2 variant',
});
expectedFrames.push({
  name: buildingTextureKey('House', 3),
  width: BUILDING_SIZES.House.w * TILE_SIZE,
  height: BUILDING_SIZES.House.h * TILE_SIZE,
  note: 'House tier 3 variant',
});
// WoodenGate closed (gateOpen === false is the only state that changes the key).
expectedFrames.push({
  name: buildingTextureKey('WoodenGate', undefined, false),
  width: BUILDING_SIZES.WoodenGate.w * TILE_SIZE,
  height: BUILDING_SIZES.WoodenGate.h * TILE_SIZE,
  note: 'WoodenGate closed variant',
});

function main() {
  const atlasPath = join(repoRoot, 'public/art/buildings-atlas.json');
  if (!existsSync(atlasPath)) {
    console.error(`[FAIL] ${atlasPath} does not exist.`);
    process.exit(1);
  }

  let atlas;
  try {
    atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
  } catch (error) {
    console.error(`[FAIL] Could not parse ${atlasPath} as JSON: ${error.message}`);
    process.exit(1);
  }

  const frames = atlas.frames ?? {};
  let failed = false;

  for (const expected of expectedFrames) {
    const found = frames[expected.name];
    if (!found) {
      console.error(`[FAIL] Missing frame "${expected.name}" (${expected.note}) in buildings-atlas.json.`);
      failed = true;
      continue;
    }
    const { w, h } = found.frame ?? {};
    if (w !== expected.width || h !== expected.height) {
      console.error(
        `[FAIL] Frame "${expected.name}" (${expected.note}): expected ${expected.width}x${expected.height}px, ` +
          `found ${w}x${h}px.`,
      );
      failed = true;
      continue;
    }
    console.log(`[OK]   "${expected.name}": ${w}x${h}px matches expected (${expected.note}).`);
  }

  // Also flag any frame in the JSON that no live BuildingType/variant
  // actually maps to - not a hard failure (an atlas is allowed to have
  // extra/unused frames), but worth surfacing since it usually means a stale
  // or renamed entry.
  const expectedNames = new Set(expectedFrames.map((f) => f.name));
  const extraNames = Object.keys(frames).filter((name) => !expectedNames.has(name));
  if (extraNames.length > 0) {
    console.log(`[INFO] ${extraNames.length} frame(s) in the atlas are not referenced by buildingTextureKey(): ${extraNames.join(', ')}`);
  }

  console.log(`\nChecked ${expectedFrames.length} expected frame names against ${Object.keys(frames).length} atlas frames.`);

  if (failed) {
    console.error('\nBuilding frame-name verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('Building frame-name verification passed.');
}

main();
