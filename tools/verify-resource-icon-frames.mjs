// Phase 78 (resource icons, HUD polish): verifies every frame name the
// running game can actually request from resource-icons-atlas.json
// (resourceIconTextureKey('<ResourceKey>')) actually exists, AND that each
// frame's packed rectangle matches its expected pixel size (12x12,
// RESOURCE_ICON_SIZE). This is a separate, narrower check from
// tools/verify-asset-dimensions.mjs (which only checks whole-PNG-file
// dimensions) - an atlas PNG's overall size passing says nothing about
// whether any individual packed frame is the right size, in the right place,
// or even present. Mirrors tools/verify-world-frames.mjs's shape exactly.
//
// Usage: node tools/verify-resource-icon-frames.mjs
// Exit code 0 = every expected frame exists with the correct size.
// Exit code 1 = at least one frame is missing or the wrong size.
//
// IMPORTANT: RESOURCE_KEYS/ICON_SIZE below are hand-transcribed mirrors of
// src/config/buildingConfig.ts's ResourceKey type/RESOURCE_ICON_SIZE constant
// - plain Node, no TypeScript loader available, same constraint every other
// tools/verify-*-frames.mjs script documents. If ResourceKey ever
// gains/loses/renames an entry, update this table (and
// tools/generate-placeholder-resource-icons.mjs) together.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const ICON_SIZE = 12;

// Mirrors buildingConfig.ts's ResourceKey union exactly (15 entries).
const RESOURCE_KEYS = [
  'rawMeat',
  'meat',
  'water',
  'eggs',
  'leather',
  'clothes',
  'logs',
  'wood',
  'potatoes',
  'liquor',
  'agaveJuice',
  'stone',
  'iron',
  'tools',
  'coal',
];

const ATLAS_CHECKS = [
  {
    file: 'public/art/resource-icons-atlas.json',
    frames: RESOURCE_KEYS.map((key) => ({
      name: `resource-icon-${key}`,
      width: ICON_SIZE,
      height: ICON_SIZE,
    })),
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

  console.log(
    `\nChecked ${totalExpected} expected frame names across ${ATLAS_CHECKS.length} atlas (${totalFound} frames found total).`,
  );

  if (failed) {
    console.error('\nResource icon frame verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('Resource icon frame verification passed.');
}

main();
