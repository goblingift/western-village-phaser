// Phase 73 (visual overhaul pipeline foundation): dimension-verification
// tool. Per the plan's §3.4 step 5 / §5i risk: most categories (tiles,
// units, animals, etc.) render at native texture pixel size with
// `setOrigin(0, 0)`/centred and are never rescaled - so a PNG even 1px off
// from its expected frame size doesn't error, it just silently misaligns on
// the map or unit grid forever. Buildings are the one exception (asset-
// pipeline rework, 2026-09-09): their textures are supersampled (currently
// targeting 4x, ART_SCALE) and rendered via `setDisplaySize()` back down to
// the correct tile footprint with LINEAR filtering - source resolution is
// deliberately decoupled from on-screen footprint, so tools/verify-
// building-frames.mjs checks a clean-multiple-of-the-footprint + internal
// consistency (every state frame for one building is the same size as every
// other) instead of one hardcoded absolute pixel size.
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
    expectedWidth: 640,
    expectedHeight: 128,
    note:
      '5 terrain frames (Dirt, Gravel, Sand, Water, Rock) x 128x128px each (32x32 x 4x ' +
      'ART_SCALE, 2026-09-09 asset-pipeline rework - see MainScene.buildTilemap()). ' +
      'Loaded via this.load.image() for Tilemap.addTilesetImage(), not this.load.atlas() - ' +
      "see BootScene.ts's preload() comment. Its companion tiles-atlas.json (Phase 79) is " +
      'documentation/tooling-only and is checked separately by verify-tileset-frames.mjs.',
  },
  // Asset-pipeline rework (2026-09-09): buildings moved from one shared
  // buildings-atlas.png to one atlas file PER BUILDING TYPE
  // (public/art/buildings/<BuildingType>.png/.json), so there is no longer a
  // single whole-file dimension to check here - each building's file size
  // varies with how many state frames (Intact/Damaged/Ruined/Construction*/
  // Tier*) it currently has. Per-building file existence, frame-name and
  // frame-size correctness is verified by tools/verify-building-frames.mjs
  // instead, which now owns this whole category end to end.

  // Phase 75: player units, villagers, animals. 4 single-frame atlases
  // (cowboys/brawlers/dynamiters/villagers, all square) + one non-square
  // single-frame atlas (mounted-cowboys) + one 4-frame animal atlas
  // (4 frames packed side-by-side: Chicken/Pig/Cow/Ostrich). Per-frame
  // name/size correctness (not just whole-file dimensions) is verified
  // separately by tools/verify-unit-frames.mjs, mirroring how
  // verify-building-frames.mjs complements this file for buildings-atlas.
  //
  // Asset-pipeline rework (2026-09-09): these are now 4x supersampled
  // (ART_SCALE) and rendered via setDisplaySize back to their real 18x18/
  // 24x18 on-screen size - expected dimensions below are the supersampled
  // source resolution (72/96), matching verify-unit-frames.mjs's own
  // ART_SCALE constant.
  {
    file: 'public/art/animals-atlas.png',
    expectedWidth: 288,
    expectedHeight: 72,
    note: '4 animal frames (Chicken, Pig, Cow, Ostrich) x 72x72px each (18x18 x 4x ART_SCALE)',
  },
  {
    file: 'public/art/cowboys-atlas.png',
    expectedWidth: 72,
    expectedHeight: 72,
    note: 'single "cowboy" frame, 72x72px (18x18 x 4x ART_SCALE)',
  },
  {
    file: 'public/art/mounted-cowboys-atlas.png',
    expectedWidth: 96,
    expectedHeight: 72,
    note: 'single "cowboy-on-horse" frame, 96x72px (24x18 x 4x ART_SCALE, non-square 4:3 ratio)',
  },
  {
    file: 'public/art/brawlers-atlas.png',
    expectedWidth: 72,
    expectedHeight: 72,
    note: 'single "brawler" frame, 72x72px (18x18 x 4x ART_SCALE)',
  },
  {
    file: 'public/art/dynamiters-atlas.png',
    expectedWidth: 72,
    expectedHeight: 72,
    note: 'single "dynamiter" frame, 72x72px (18x18 x 4x ART_SCALE)',
  },
  {
    file: 'public/art/villagers-atlas.png',
    expectedWidth: 72,
    expectedHeight: 72,
    note: 'single "villager" frame, 72x72px (18x18 x 4x ART_SCALE)',
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
  // Phase 77: vegetation, carts, accents. vegetation-atlas is a uniform 2-frame
  // strip at TILE_SIZE (32x32, unaffected by Phase 75's 12->18 small-unit
  // bump); carts-atlas is a single non-square 14x10 frame (CART_SPRITE_WIDTH/
  // HEIGHT, independent literals); accents-atlas packs 6 frames of differing
  // sizes side-by-side (16+24+64+16+12+12 = 144 wide, tallest frame 24 high).
  // Per-frame name/size correctness (not just whole-file dimensions) is
  // verified separately by tools/verify-world-frames.mjs.
  {
    file: 'public/art/vegetation-atlas.png',
    expectedWidth: 64,
    expectedHeight: 32,
    note: '2 vegetation frames (Tree, Cactus) x 32x32px each',
  },
  {
    file: 'public/art/carts-atlas.png',
    expectedWidth: 14,
    expectedHeight: 10,
    note: 'single "goods-cart" frame, 14x10px (non-square)',
  },
  {
    file: 'public/art/accents-atlas.png',
    expectedWidth: 144,
    expectedHeight: 24,
    note:
      '6 accent frames packed side-by-side: WellCrank 16x4, WarehouseDoor 24x24, ' +
      'SupermarketAwning 64x8, ChickenDoor 16x12, HouseWindowLight 12x12, Campfire 12x12',
  },
  // Phase 78: resource icons (HUD polish). 15 frames (one per ResourceKey,
  // mirrors src/config/buildingConfig.ts's ResourceKey union) packed
  // side-by-side, each 12x12px (RESOURCE_ICON_SIZE - a HUD-chrome size
  // independent of Phase 75/76's 12->18 small-unit-sprite bump). Per-frame
  // name/size correctness is verified separately by
  // tools/verify-resource-icon-frames.mjs.
  {
    file: 'public/art/resource-icons-atlas.png',
    expectedWidth: 180,
    expectedHeight: 12,
    note: '15 resource icon frames x 12x12px each (one per ResourceKey)',
  },
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
