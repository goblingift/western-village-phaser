// Phase 79: verifies the terrain tileset's companion
// public/art/tiles-atlas.json (added this phase for documentation/tooling
// parity with the other 13 atlas categories - see BootScene.ts's preload()
// comment and tools/generate-placeholder-tiles.mjs's doc comment for why the
// actual Phaser load call stays `this.load.image(...)`, not `this.load.atlas
// (...)`, and never reads this JSON at runtime). This script exists purely so
// the JSON itself can't silently drift from the PNG it describes - it checks
// each `tile-<TileType>` frame exists, is packed at the correct 32x32 size,
// and sits at the correct x-offset for its TileType enum index (Dirt=0,
// Gravel=1, Sand=2, Water=3, Rock=4 - src/config/mapConfig.ts), matching
// tools/verify-world-frames.mjs's per-frame-name/size verification shape.
//
// Usage: node tools/verify-tileset-frames.mjs
// Exit code 0 = every expected frame exists with the correct size and offset.
// Exit code 1 = at least one frame is missing, the wrong size, or at the
//   wrong x-offset (which would indicate the tile order no longer matches
//   TileType's enum order).

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TILE_SIZE = 32;

// Order MUST match src/config/mapConfig.ts's TileType enum exactly (Dirt=0,
// Gravel=1, Sand=2, Water=3, Rock=4) - the same invariant
// tools/generate-placeholder-tiles.mjs documents.
const EXPECTED_TILES = ['Dirt', 'Gravel', 'Sand', 'Water', 'Rock'];

function main() {
  let failed = false;

  const jsonPath = join(repoRoot, 'public/art/tiles-atlas.json');
  if (!existsSync(jsonPath)) {
    console.error('[FAIL] public/art/tiles-atlas.json does not exist.');
    process.exit(1);
  }

  let atlas;
  try {
    atlas = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    console.error(`[FAIL] Could not parse public/art/tiles-atlas.json as JSON: ${error.message}`);
    process.exit(1);
  }

  const frames = atlas.frames ?? {};

  EXPECTED_TILES.forEach((tileName, index) => {
    const frameName = `tile-${tileName}`;
    const found = frames[frameName];
    if (!found) {
      console.error(`[FAIL] public/art/tiles-atlas.json: missing frame "${frameName}".`);
      failed = true;
      return;
    }

    const { x, y, w, h } = found.frame ?? {};
    const expectedX = index * TILE_SIZE;

    if (w !== TILE_SIZE) {
      console.error(
        `[FAIL] public/art/tiles-atlas.json: frame "${frameName}" expected width ${TILE_SIZE}px, found ${w}px.`,
      );
      failed = true;
      return;
    }
    if (h !== TILE_SIZE) {
      console.error(
        `[FAIL] public/art/tiles-atlas.json: frame "${frameName}" expected height ${TILE_SIZE}px, found ${h}px.`,
      );
      failed = true;
      return;
    }
    if (x !== expectedX || y !== 0) {
      console.error(
        `[FAIL] public/art/tiles-atlas.json: frame "${frameName}" expected offset (${expectedX}, 0), ` +
          `found (${x}, ${y}) - tile order no longer matches TileType enum order.`,
      );
      failed = true;
      return;
    }

    console.log(`[OK]   public/art/tiles-atlas.json: "${frameName}" ${w}x${h}px at (${x}, ${y}) matches expected.`);
  });

  const expectedNames = new Set(EXPECTED_TILES.map((name) => `tile-${name}`));
  const extraNames = Object.keys(frames).filter((name) => !expectedNames.has(name));
  if (extraNames.length > 0) {
    console.log(
      `[INFO] public/art/tiles-atlas.json: ${extraNames.length} frame(s) not referenced by this check: ${extraNames.join(', ')}`,
    );
  }

  if (failed) {
    console.error('\nTileset frame verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('\nTileset frame verification passed.');
}

main();
