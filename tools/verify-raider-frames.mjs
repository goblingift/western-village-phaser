// Phase 76 (raiders, raider camps, wildlife): verifies every frame name the
// running game can actually request from the 3 atlases this phase owns
// (raiderTextureKey('<Faction>'), raiderCampTextureKey('<Faction>'),
// wildlifeTextureKey('<Kind>')) actually exists in its atlas's JSON, AND that
// each frame's packed rectangle matches its expected pixel size (18x18 for
// raiders/wildlife per WILDLIFE_SPRITE_SIZE's 12->18 bump this phase, 24x24
// for raider camps, unaffected by that bump). This is a separate, narrower
// check from tools/verify-asset-dimensions.mjs (which only checks whole-PNG-
// file dimensions) - an atlas PNG's overall size passing says nothing about
// whether any individual packed frame is the right size, in the right place,
// or even present. Mirrors tools/verify-unit-frames.mjs's shape exactly.
//
// Usage: node tools/verify-raider-frames.mjs
// Exit code 0 = every expected frame exists with the correct size in every
//   atlas.
// Exit code 1 = at least one frame is missing or the wrong size in any atlas.
//
// IMPORTANT: SPRITE_SIZE/CAMP_SIZE below are hand-transcribed mirrors of
// RAIDER_SPRITE_SIZE/RAIDER_CAMP_SPRITE_SIZE (src/config/buildingConfig.ts)
// and WILDLIFE_SPRITE_SIZE (src/config/wildlifeConfig.ts) - plain Node, no
// TypeScript loader available - same constraint verify-unit-frames.mjs's own
// doc comment documents. If those constants change again, update this table
// (and tools/generate-placeholder-raiders.mjs) together.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const SPRITE_SIZE = 18;
const CAMP_SIZE = 24;

/**
 * One entry per atlas file this phase owns: which frame names it must
 * contain, and at what size each one must be packed.
 */
const ATLAS_CHECKS = [
  {
    file: 'public/art/raiders-atlas.json',
    frames: [
      { name: 'raider-Outlaws', width: SPRITE_SIZE, height: SPRITE_SIZE },
      { name: 'raider-Rustlers', width: SPRITE_SIZE, height: SPRITE_SIZE },
      { name: 'raider-Coyotes', width: SPRITE_SIZE, height: SPRITE_SIZE },
    ],
  },
  {
    file: 'public/art/raider-camps-atlas.json',
    frames: [
      { name: 'raider-camp-Outlaws', width: CAMP_SIZE, height: CAMP_SIZE },
      { name: 'raider-camp-Rustlers', width: CAMP_SIZE, height: CAMP_SIZE },
      { name: 'raider-camp-Coyotes', width: CAMP_SIZE, height: CAMP_SIZE },
    ],
  },
  {
    file: 'public/art/wildlife-atlas.json',
    frames: [
      { name: 'wildlife-Snake', width: SPRITE_SIZE, height: SPRITE_SIZE },
      { name: 'wildlife-Coyote', width: SPRITE_SIZE, height: SPRITE_SIZE },
      { name: 'wildlife-MountainLion', width: SPRITE_SIZE, height: SPRITE_SIZE },
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
      if (w !== expected.width || h !== expected.height) {
        console.error(
          `[FAIL] ${atlasCheck.file}: frame "${expected.name}" expected ${expected.width}x${expected.height}px, ` +
            `found ${w}x${h}px.`,
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
    console.error('\nRaider/raider-camp/wildlife frame verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('Raider/raider-camp/wildlife frame verification passed.');
}

main();
