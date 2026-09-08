// Phase 75 (player units, villagers, animals): verifies every frame name the
// running game can actually request from the 6 atlases this phase owns
// (animalTextureKey('<Kind>'), COWBOY_TEXTURE_KEY, MOUNTED_COWBOY_TEXTURE_KEY,
// BRAWLER_TEXTURE_KEY, DYNAMITER_TEXTURE_KEY, VILLAGER_TEXTURE_KEY) actually
// exists in its atlas's JSON, AND that each frame's packed rectangle matches
// its expected pixel size (18x18 for every square small-unit frame, 24x18 for
// the non-square mounted-cowboy frame). This is a separate, narrower check
// from tools/verify-asset-dimensions.mjs (which only checks whole-PNG-file
// dimensions) - an atlas PNG's overall size passing says nothing about
// whether any individual packed frame is the right size, in the right place,
// or even present. Mirrors tools/verify-building-frames.mjs's shape exactly.
//
// Usage: node tools/verify-unit-frames.mjs
// Exit code 0 = every expected frame exists with the correct size in every
//   atlas.
// Exit code 1 = at least one frame is missing or the wrong size in any atlas.
//
// IMPORTANT: SPRITE_SIZE/MOUNTED_WIDTH/MOUNTED_HEIGHT below are hand-
// transcribed mirrors of ANIMAL_SPRITE_SIZE/MOUNTED_COWBOY_SPRITE_WIDTH/
// MOUNTED_COWBOY_SPRITE_HEIGHT in src/config/buildingConfig.ts (plain Node, no
// TypeScript loader available - same constraint verify-building-frames.mjs's
// own doc comment documents). If those constants change again, update this
// table (and tools/generate-placeholder-units.mjs) together.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const SPRITE_SIZE = 18;
const MOUNTED_WIDTH = 24;
const MOUNTED_HEIGHT = 18;

/**
 * One entry per atlas file this phase owns: which frame names it must
 * contain, and at what size each one must be packed.
 */
const ATLAS_CHECKS = [
  {
    file: 'public/art/animals-atlas.json',
    frames: [
      { name: 'animal-Chicken', width: SPRITE_SIZE, height: SPRITE_SIZE },
      { name: 'animal-Pig', width: SPRITE_SIZE, height: SPRITE_SIZE },
      { name: 'animal-Cow', width: SPRITE_SIZE, height: SPRITE_SIZE },
      { name: 'animal-Ostrich', width: SPRITE_SIZE, height: SPRITE_SIZE },
    ],
  },
  {
    file: 'public/art/cowboys-atlas.json',
    frames: [{ name: 'cowboy', width: SPRITE_SIZE, height: SPRITE_SIZE }],
  },
  {
    file: 'public/art/mounted-cowboys-atlas.json',
    frames: [{ name: 'cowboy-on-horse', width: MOUNTED_WIDTH, height: MOUNTED_HEIGHT }],
  },
  {
    file: 'public/art/brawlers-atlas.json',
    frames: [{ name: 'brawler', width: SPRITE_SIZE, height: SPRITE_SIZE }],
  },
  {
    file: 'public/art/dynamiters-atlas.json',
    frames: [{ name: 'dynamiter', width: SPRITE_SIZE, height: SPRITE_SIZE }],
  },
  {
    file: 'public/art/villagers-atlas.json',
    frames: [{ name: 'villager', width: SPRITE_SIZE, height: SPRITE_SIZE }],
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
    console.error('\nUnit/animal/villager frame verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('Unit/animal/villager frame verification passed.');
}

main();
