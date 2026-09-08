// Phase 73 (visual overhaul pipeline foundation): dimension-verification
// tool. Per the plan's §3.4 step 5 / §5i risk: buildings/tiles/units are
// rendered at native texture pixel size with `setOrigin(0, 0)` (buildings) or
// centred (units) and are NEVER `setDisplaySize`d - so a PNG that is even 1px
// off from its expected frame size does not error, it just silently misaligns
// on the map or the unit grid forever. This script is the automated guard
// against that failure mode.
//
// Usage: node tools/verify-asset-dimensions.mjs
// Exit code 0 = every checked file matches its expected dimensions.
// Exit code 1 = at least one file is missing or the wrong size (message
//   printed to stderr explains exactly which file and what was expected vs.
//   found).
//
// This is deliberately a flat, hand-maintained table rather than something
// that tries to derive expected sizes from BUILDING_DEFINITIONS/etc. - Phase
// 73 only ships one asset (the terrain tileset). Later phases (74-78) should
// append one entry per new atlas file they ship (buildings-atlas.png,
// animals-atlas.png, ...) rather than building a generic derivation layer
// ahead of need.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPngDimensions } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

/**
 * @typedef {{ file: string, expectedWidth: number, expectedHeight: number, note?: string }} AssetCheck
 */

/** @type {AssetCheck[]} */
const ASSET_CHECKS = [
  {
    file: 'public/art/tiles-atlas.png',
    expectedWidth: 160,
    expectedHeight: 32,
    note: '5 terrain frames (Dirt, Gravel, Sand, Water, Rock) x 32x32px each',
  },
  // Phase 74: 34 building base frames (11 x 32x32 1x1 + 23 x 64x64 2x2, all
  // packed side-by-side in one row) + 3 appended 32x32 variant frames
  // (House-tier2, House-tier3, WoodenGate-closed) = 1920x64px overall. This
  // only checks the whole-file dimensions (packing sanity); per-frame name
  // and per-frame size correctness is verified separately by
  // tools/verify-building-frames.mjs, which reads buildings-atlas.json.
  {
    file: 'public/art/buildings-atlas.png',
    expectedWidth: 1920,
    expectedHeight: 64,
    note:
      '34 building base frames (11x 32x32 + 23x 64x64) + 3 appended 32x32 variant frames ' +
      '(House-tier2, House-tier3, WoodenGate-closed), packed side-by-side in one row',
  },
  // Phase 75: player units, villagers, animals. 4 single-frame atlases
  // (cowboys/brawlers/dynamiters/villagers, all square 18x18) + one non-square
  // single-frame atlas (mounted-cowboys, 24x18) + one 4-frame animal atlas
  // (72x18, 4 x 18x18 packed side-by-side: Chicken/Pig/Cow/Ostrich). Per-frame
  // name/size correctness (not just whole-file dimensions) is verified
  // separately by tools/verify-unit-frames.mjs, mirroring how
  // verify-building-frames.mjs complements this file for buildings-atlas.
  {
    file: 'public/art/animals-atlas.png',
    expectedWidth: 72,
    expectedHeight: 18,
    note: '4 animal frames (Chicken, Pig, Cow, Ostrich) x 18x18px each',
  },
  {
    file: 'public/art/cowboys-atlas.png',
    expectedWidth: 18,
    expectedHeight: 18,
    note: 'single "cowboy" frame, 18x18px',
  },
  {
    file: 'public/art/mounted-cowboys-atlas.png',
    expectedWidth: 24,
    expectedHeight: 18,
    note: 'single "cowboy-on-horse" frame, 24x18px (non-square, 4:3 ratio)',
  },
  {
    file: 'public/art/brawlers-atlas.png',
    expectedWidth: 18,
    expectedHeight: 18,
    note: 'single "brawler" frame, 18x18px',
  },
  {
    file: 'public/art/dynamiters-atlas.png',
    expectedWidth: 18,
    expectedHeight: 18,
    note: 'single "dynamiter" frame, 18x18px',
  },
  {
    file: 'public/art/villagers-atlas.png',
    expectedWidth: 18,
    expectedHeight: 18,
    note: 'single "villager" frame, 18x18px',
  },
  // Phase 76: raiders, raider camps, wildlife. Raiders/wildlife are 3-frame
  // uniform-grid strips at 18x18 each (WILDLIFE_SPRITE_SIZE raised 12->18
  // this phase to match RAIDER_SPRITE_SIZE, itself an alias of Phase 75's
  // ANIMAL_SPRITE_SIZE); raider camps are a 3-frame strip at 24x24 each
  // (RAIDER_CAMP_SPRITE_SIZE, an independent literal this phase does not
  // touch). Per-frame name/size correctness is verified separately by
  // tools/verify-raider-frames.mjs.
  {
    file: 'public/art/raiders-atlas.png',
    expectedWidth: 54,
    expectedHeight: 18,
    note: '3 raider frames (Outlaws, Rustlers, Coyotes) x 18x18px each',
  },
  {
    file: 'public/art/raider-camps-atlas.png',
    expectedWidth: 72,
    expectedHeight: 24,
    note: '3 raider camp frames (Outlaws, Rustlers, Coyotes) x 24x24px each',
  },
  {
    file: 'public/art/wildlife-atlas.png',
    expectedWidth: 54,
    expectedHeight: 18,
    note: '3 wildlife frames (Snake, Coyote, MountainLion) x 18x18px each',
  },
  // Phase 77: append vegetation-atlas.png / carts-atlas.png / accents-atlas.png
  // Phase 78: append resource-icons-atlas.png
];

function main() {
  let failed = false;

  for (const check of ASSET_CHECKS) {
    const absolutePath = join(repoRoot, check.file);

    if (!existsSync(absolutePath)) {
      console.error(`[FAIL] ${check.file}: file does not exist.`);
      failed = true;
      continue;
    }

    let dimensions;
    try {
      const buffer = readFileSync(absolutePath);
      dimensions = readPngDimensions(buffer);
    } catch (error) {
      console.error(`[FAIL] ${check.file}: could not read PNG dimensions (${error.message}).`);
      failed = true;
      continue;
    }

    if (dimensions.width !== check.expectedWidth || dimensions.height !== check.expectedHeight) {
      console.error(
        `[FAIL] ${check.file}: expected ${check.expectedWidth}x${check.expectedHeight}px` +
          (check.note ? ` (${check.note})` : '') +
          `, found ${dimensions.width}x${dimensions.height}px.`,
      );
      failed = true;
      continue;
    }

    console.log(`[OK]   ${check.file}: ${dimensions.width}x${dimensions.height}px matches expected.`);
  }

  if (failed) {
    console.error('\nAsset dimension verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('\nAsset dimension verification passed for all checked files.');
}

main();
