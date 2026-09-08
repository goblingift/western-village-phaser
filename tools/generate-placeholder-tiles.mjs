// Phase 73 (visual overhaul pipeline foundation): generates a PLACEHOLDER
// terrain tileset PNG at public/art/tiles-atlas.png.
//
// THIS IS NOT REAL ART. No AI-image-generation tool was available in the
// environment this was built in (see docs/phase_73_to_78_visual_overhaul_plan.md
// section 2/3 for the real target art spec). This script exists purely to
// prove the loading pipeline end-to-end - correct file path, correct
// dimensions, correct frame order/count - with an obviously-placeholder flat
// color per terrain type. It must be replaced with a real, AI-generated
// 160x32 5-frame strip (Dirt/Gravel/Sand/Water/Rock, in that exact order)
// before this overhaul is considered visually complete.
//
// Phase 79: also writes a companion public/art/tiles-atlas.json (JSONHash
// format, frame names `tile-Dirt`..`tile-Rock`), purely for documentation/
// tooling consistency with the other 13 atlas categories. This JSON is NOT
// what BootScene.ts actually loads for tilemap purposes - Phaser's
// Tilemap.addTilesetImage() needs a texture it can slice into a uniform grid
// by numeric tile index, so the real load call stays a plain
// `this.load.image(TILESET_KEY, 'art/tiles-atlas.png')` (see BootScene.ts's
// preload() comment for the full investigation/reasoning). This JSON exists
// so the terrain tileset is verifiable/inspectable the same way every other
// atlas is (tools/verify-asset-dimensions.mjs checks its frame table), and so
// a human editing the PNG in a packer tool has an accurate frame map to work
// from - it is deliberately never passed to `this.load.atlas()`.
//
// Usage: node tools/generate-placeholder-tiles.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TILE_SIZE = 32;

// Order MUST match src/config/mapConfig.ts's TileType enum exactly:
// Dirt=0, Gravel=1, Sand=2, Water=3, Rock=4. Tile index in the generated
// tilemap is used directly as the tileset frame index - reordering this
// array would silently repaint the whole map with the wrong terrain.
const TILES = [
  { name: 'Dirt', color: [0x9c, 0x7b, 0x52] },
  { name: 'Gravel', color: [0x8a, 0x81, 0x72] },
  { name: 'Sand', color: [0xd2, 0xb4, 0x8c] },
  { name: 'Water', color: [0x2f, 0x7f, 0xbf] },
  { name: 'Rock', color: [0x6b, 0x65, 0x60] },
];

const width = TILES.length * TILE_SIZE;
const height = TILE_SIZE;
const rgba = Buffer.alloc(width * height * 4);

// A darker corner marker + a lighter border on each frame is drawn (still a
// flat placeholder, not art) so frame boundaries are visually obvious when
// eyeballing the sheet - an all-solid-color strip with no frame indicator
// would make it too easy to mistake for an intentional design rather than a
// placeholder awaiting real art.
for (let frame = 0; frame < TILES.length; frame++) {
  const [r, g, b] = TILES[frame].color;
  const originX = frame * TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const isBorder = x === 0 || y === 0 || x === TILE_SIZE - 1 || y === TILE_SIZE - 1;
      const isCornerMark = x < 6 && y < 6;
      let pr = r;
      let pg = g;
      let pb = b;
      if (isCornerMark) {
        // Darken the top-left corner block as a "placeholder" tell.
        pr = Math.max(0, r - 60);
        pg = Math.max(0, g - 60);
        pb = Math.max(0, b - 60);
      } else if (isBorder) {
        pr = Math.min(255, r + 40);
        pg = Math.min(255, g + 40);
        pb = Math.min(255, b + 40);
      }
      const px = originX + x;
      const idx = (y * width + px) * 4;
      rgba[idx] = pr;
      rgba[idx + 1] = pg;
      rgba[idx + 2] = pb;
      rgba[idx + 3] = 255;
    }
  }
}

const png = encodePng(width, height, rgba);
const outDir = join(repoRoot, 'public', 'art');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'tiles-atlas.png');
writeFileSync(outPath, png);

// Companion JSONHash atlas JSON - documentation/tooling only, see the file
// doc comment above. Frame names are `tile-<TileType>` to disambiguate from
// buildings-atlas.json's `building-<Type>` convention and every other
// category's `<category>-<Name>` naming.
const frames = {};
TILES.forEach((tile, index) => {
  const x = index * TILE_SIZE;
  frames[`tile-${tile.name}`] = {
    frame: { x, y: 0, w: TILE_SIZE, h: TILE_SIZE },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: TILE_SIZE, h: TILE_SIZE },
    sourceSize: { w: TILE_SIZE, h: TILE_SIZE },
  };
});

const atlasJson = {
  frames,
  meta: {
    app: 'western-village-phaser tools/generate-placeholder-tiles.mjs',
    version: '1.0',
    image: 'tiles-atlas.png',
    format: 'RGBA8888',
    size: { w: width, h: height },
    scale: '1',
  },
};

const jsonPath = join(outDir, 'tiles-atlas.json');
writeFileSync(jsonPath, JSON.stringify(atlasJson, null, 2));

console.log(`Wrote placeholder tileset: ${outPath} (${width}x${height}px, ${TILES.length} frames)`);
console.log(`Wrote companion atlas JSON (docs/tooling only, not used for tilemap loading): ${jsonPath}`);
console.log('Frame order: ' + TILES.map((t) => t.name).join(', '));
console.log('REMINDER: this is a PLACEHOLDER. Replace with real AI-generated art before shipping.');
