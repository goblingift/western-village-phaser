// Phase 77 (vegetation, carts, accents): verifies every frame name the
// running game can actually request from the 3 atlases this phase owns
// (vegetationTextureKey('<Kind>'), CART_TEXTURE_KEY, accentTextureKey('<Kind>'))
// actually exists in its atlas's JSON, AND that each frame's packed
// rectangle matches its expected pixel size - INCLUDING verifying non-square
// shapes round-trip correctly (width and height are checked independently,
// not just total pixel/area count, so a width/height swap on e.g. the 14x10
// cart or the 16x4 WellCrank bar is caught). This is a separate, narrower
// check from tools/verify-asset-dimensions.mjs (which only checks whole-PNG-
// file dimensions) - an atlas PNG's overall size passing says nothing about
// whether any individual packed frame is the right size, in the right place,
// or even present. Mirrors tools/verify-raider-frames.mjs's shape exactly.
//
// Usage: node tools/verify-world-frames.mjs
// Exit code 0 = every expected frame exists with the correct size in every
//   atlas.
// Exit code 1 = at least one frame is missing or the wrong size in any atlas.
//
// IMPORTANT: sizes below are hand-transcribed mirrors of
// src/config/buildingConfig.ts (CART_SPRITE_WIDTH/HEIGHT, and the accent
// frame sizes, which are themselves derived from BootScene.ts's pre-Phase-77
// ACCENT_SPRITES pattern dimensions x PIXEL_SIZE) and TILE_SIZE
// (src/config/constants.ts, vegetation frames) - plain Node, no TypeScript
// loader available, same constraint every other tools/verify-*-frames.mjs
// script documents. If any of these sizes change again, update this table
// (and tools/generate-placeholder-world.mjs) together.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TILE_SIZE = 32;

/**
 * One entry per atlas file this phase owns: which frame names it must
 * contain, and at what size (width, height checked independently) each one
 * must be packed.
 */
const ATLAS_CHECKS = [
  {
    file: 'public/art/vegetation-atlas.json',
    frames: [
      { name: 'vegetation-Tree', width: TILE_SIZE, height: TILE_SIZE },
      { name: 'vegetation-Cactus', width: TILE_SIZE, height: TILE_SIZE },
    ],
  },
  {
    file: 'public/art/carts-atlas.json',
    frames: [{ name: 'goods-cart', width: 14, height: 10 }],
  },
  {
    file: 'public/art/accents-atlas.json',
    frames: [
      { name: 'accent-WellCrank', width: 16, height: 4 },
      { name: 'accent-WarehouseDoor', width: 24, height: 24 },
      { name: 'accent-SupermarketAwning', width: 64, height: 8 },
      { name: 'accent-ChickenDoor', width: 16, height: 12 },
      { name: 'accent-HouseWindowLight', width: 12, height: 12 },
      { name: 'accent-Campfire', width: 12, height: 12 },
    ],
  },
];

function main() {
  let failed = false;
  let totalExpected = 0;
  let totalFound = 0;

  for (const atlasCheck of ATLAS_CHECKS) {
    const atlasPath = join(repoRoot, atlasCheck.file);
    if (!existsSync(atlasPath)) {
      console.error(`[FAIL] ${atlasCheck.file} does not exist.`);
      failed = true;
      continue;
    }

    let atlas;
    try {
      atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
    } catch (error) {
      console.error(`[FAIL] Could not parse ${atlasCheck.file} as JSON: ${error.message}`);
      failed = true;
      continue;
    }

    const frames = atlas.frames ?? {};
    totalFound += Object.keys(frames).length;

    for (const expected of atlasCheck.frames) {
      totalExpected += 1;
      const found = frames[expected.name];
      if (!found) {
        console.error(`[FAIL] ${atlasCheck.file}: missing frame "${expected.name}".`);
        failed = true;
        continue;
      }
      const { w, h } = found.frame ?? {};
      // Width and height are checked as two independent assertions (not e.g.
      // w*h === expected area) specifically so a width/height swap on a
      // non-square frame (cart 14x10 -> 10x14, WellCrank 16x4 -> 4x16) is
      // caught even though the total pixel count would be identical.
      if (w !== expected.width) {
        console.error(
          `[FAIL] ${atlasCheck.file}: frame "${expected.name}" expected width ${expected.width}px, found ${w}px.`,
        );
        failed = true;
        continue;
      }
      if (h !== expected.height) {
        console.error(
          `[FAIL] ${atlasCheck.file}: frame "${expected.name}" expected height ${expected.height}px, found ${h}px.`,
        );
        failed = true;
        continue;
      }
      console.log(`[OK]   ${atlasCheck.file}: "${expected.name}" ${w}x${h}px matches expected.`);
    }

    const expectedNames = new Set(atlasCheck.frames.map((f) => f.name));
    const extraNames = Object.keys(frames).filter((name) => !expectedNames.has(name));
    if (extraNames.length > 0) {
      console.log(
        `[INFO] ${atlasCheck.file}: ${extraNames.length} frame(s) not referenced by this check: ${extraNames.join(', ')}`,
      );
    }
  }

  console.log(`\nChecked ${totalExpected} expected frame names across ${ATLAS_CHECKS.length} atlases (${totalFound} frames found total).`);

  if (failed) {
    console.error('\nVegetation/cart/accent frame verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('Vegetation/cart/accent frame verification passed.');
}

main();
