// Phase 74 (buildings): generates a PLACEHOLDER buildings atlas
// (public/art/buildings-atlas.png + .json) at BUILDING_ATLAS_KEY.
//
// THIS IS NOT REAL ART. No AI-image-generation tool was available in the
// environment this was built in (see
// docs/phase_73_to_78_visual_overhaul_plan.md sections 2/3 for the real
// target art spec). This script exists purely to prove the loading pipeline
// end-to-end - correct file path, correct per-frame dimensions (derived from
// each building's real footprint, never hardcoded), correct frame names
// exactly matching what `buildingTextureKey()` produces - with an obviously
// fake flat-color-plus-marker sprite per building. It must be replaced with
// real, AI-generated art before this overhaul is considered visually
// complete; see public/art/README.md.
//
// Usage: node tools/generate-placeholder-buildings.mjs
//
// IMPORTANT: the `BUILDINGS` table below is a hand-transcribed mirror of
// src/config/buildingConfig.ts's BUILDING_DEFINITIONS (type, footprint size,
// category) - this script is plain Node (no TypeScript loader available), so
// it cannot import the real .ts source directly. If a building is added,
// removed, resized, or recategorized in buildingConfig.ts, this table (and
// BUILDING_TIER_VARIANTS/BUILDING_GATE_VARIANTS below) must be updated to
// match, or the two `node tools/*.mjs` verification scripts will start
// failing (missing/extra frame names, wrong dimensions) - which is the
// intended guard rail, not a bug.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TILE_SIZE = 32;

// One row per BuildingType, in BUILDING_DEFINITIONS' own declaration order
// (order doesn't matter for a JSON atlas - frames are looked up by name, not
// position - but keeping it in source order makes this table easy to diff
// against buildingConfig.ts by eye).
const BUILDINGS = [
  { type: 'OstrichFarm', w: 2, h: 2, category: 'Livestock' },
  { type: 'Butcher', w: 2, h: 2, category: 'Industry' },
  { type: 'Well', w: 1, h: 1, category: 'Housing' },
  { type: 'House', w: 1, h: 1, category: 'Housing' },
  { type: 'Road', w: 1, h: 1, category: 'Barriers' },
  { type: 'ChickenFarm', w: 1, h: 1, category: 'Livestock' },
  { type: 'PigFarm', w: 2, h: 2, category: 'Livestock' },
  { type: 'CowRanch', w: 2, h: 2, category: 'Livestock' },
  { type: 'Fence', w: 1, h: 1, category: 'Barriers' },
  { type: 'Gate', w: 1, h: 1, category: 'Barriers' },
  { type: 'WoodenWall', w: 1, h: 1, category: 'Barriers' },
  { type: 'WoodenGate', w: 1, h: 1, category: 'Barriers' },
  { type: 'Warehouse', w: 2, h: 2, category: 'Housing' },
  { type: 'Granary', w: 1, h: 1, category: 'Housing' },
  { type: 'Supermarket', w: 2, h: 2, category: 'Commerce' },
  { type: 'Barracks', w: 2, h: 2, category: 'Military' },
  { type: 'Sewery', w: 2, h: 2, category: 'Industry' },
  { type: 'Forestry', w: 2, h: 2, category: 'Farming' },
  { type: 'WoodCutter', w: 2, h: 2, category: 'Industry' },
  { type: 'PotatoField', w: 2, h: 2, category: 'Farming' },
  { type: 'Liquor', w: 2, h: 2, category: 'Industry' },
  { type: 'Saloon', w: 2, h: 2, category: 'Commerce' },
  { type: 'Horsery', w: 2, h: 2, category: 'Military' },
  { type: 'Bank', w: 2, h: 2, category: 'Commerce' },
  { type: 'CactusMilker', w: 2, h: 2, category: 'Farming' },
  { type: 'Watchtower', w: 1, h: 1, category: 'Military' },
  { type: 'Quarry', w: 2, h: 2, category: 'Farming' },
  { type: 'IronMine', w: 2, h: 2, category: 'Farming' },
  { type: 'CoalMine', w: 2, h: 2, category: 'Farming' },
  { type: 'Blacksmith', w: 2, h: 2, category: 'Industry' },
  { type: 'TradingPost', w: 2, h: 2, category: 'Commerce' },
  { type: 'WaterTower', w: 1, h: 1, category: 'Housing' },
  { type: 'Church', w: 2, h: 2, category: 'Housing' },
  { type: 'Brothel', w: 2, h: 2, category: 'Commerce' },
];

if (BUILDINGS.length !== 34) {
  throw new Error(`Expected 34 BuildingType entries, found ${BUILDINGS.length}. Update this table.`);
}

// Extra named frames buildingTextureKey() can produce beyond the 34 base
// frames above - see buildingConfig.ts's buildingTextureKey(). House's tier2/
// tier3 variants and WoodenGate's closed variant are always 1x1 (matching
// their base building's own footprint), so no separate size table is needed.
const VARIANT_FRAMES = [
  { key: 'building-House-tier2', w: 1, h: 1, category: 'Housing', markerSeed: 100 },
  { key: 'building-House-tier3', w: 1, h: 1, category: 'Housing', markerSeed: 101 },
  { key: 'building-WoodenGate-closed', w: 1, h: 1, category: 'Barriers', markerSeed: 102 },
];

/**
 * A palette family per BuildingCategory (§ "vary by category so buildings in
 * the same category are visually grouped at a glance") - deliberately flat/
 * saturated placeholder hues, NOT the real Western palette from the plan's
 * §2.3 (that's for the real art pass). Each entry is [r,g,b] for the frame's
 * base fill.
 */
const CATEGORY_BASE_COLOR = {
  Housing: [0xff, 0xb3, 0x00], // amber
  Barriers: [0x8d, 0x6e, 0x63], // brown
  Livestock: [0x8b, 0xc3, 0x4a], // light green
  Farming: [0x2e, 0x7d, 0x32], // dark green
  Industry: [0xe6, 0x51, 0x00], // burnt orange
  Commerce: [0x8e, 0x24, 0xaa], // purple
  Military: [0x37, 0x47, 0x4f], // slate
};

const CATEGORY_MARKER_COLOR = {
  Housing: [0x5d, 0x40, 0x37],
  Barriers: [0x3e, 0x27, 0x23],
  Livestock: [0x1b, 0x5e, 0x20],
  Farming: [0x1b, 0x3d, 0x1c],
  Industry: [0x4e, 0x1a, 0x00],
  Commerce: [0x4a, 0x14, 0x8c],
  Military: [0x10, 0x1c, 0x21],
};

const BORDER_LIGHTEN = 40;

function lighten([r, g, b], amount) {
  return [Math.min(255, r + amount), Math.min(255, g + amount), Math.min(255, b + amount)];
}

function darken([r, g, b], amount) {
  return [Math.max(0, r - amount), Math.max(0, g - amount), Math.max(0, b - amount)];
}

// Deterministic small "index marker" pattern so two buildings in the same
// category (same base/border color) are not pixel-identical - a 4x4 block
// grid in the top-left corner, filled according to the building's own index
// in bit-pattern form (still a flat placeholder, not art, just enough to
// visually tell two same-category buildings apart while testing).
function drawIndexMarker(rgba, width, originX, originY, index, markerColor, bgColor) {
  const bits = index & 0xf; // 4 bits -> 4 marker cells
  const cellSize = 4;
  for (let cell = 0; cell < 4; cell++) {
    const on = (bits >> cell) & 1;
    const cx = cell % 2;
    const cy = Math.floor(cell / 2);
    const color = on ? markerColor : bgColor;
    for (let y = 0; y < cellSize; y++) {
      for (let x = 0; x < cellSize; x++) {
        const px = originX + cx * cellSize + x;
        const py = originY + cy * cellSize + y;
        const idx = (py * width + px) * 4;
        rgba[idx] = color[0];
        rgba[idx + 1] = color[1];
        rgba[idx + 2] = color[2];
        rgba[idx + 3] = 255;
      }
    }
  }
}

function drawFootprintSizeHint(rgba, width, originX, originY, frameW, frameH, w, h, color) {
  // Bottom-right corner: draw `w` small ticks along the bottom edge and `h`
  // small ticks along the right edge, so a 2x2 building visually differs
  // from a 1x1 even within the same category/index-marker collision (there
  // are more buildings than 16 index-marker combinations per category).
  const tick = 3;
  for (let i = 0; i < w; i++) {
    const px0 = originX + frameW - (i + 1) * (tick + 1);
    for (let x = 0; x < tick; x++) {
      for (let y = 0; y < tick; y++) {
        const px = px0 + x;
        const py = originY + frameH - tick - 1 + y;
        const idx = (py * width + px) * 4;
        rgba[idx] = color[0];
        rgba[idx + 1] = color[1];
        rgba[idx + 2] = color[2];
        rgba[idx + 3] = 255;
      }
    }
  }
  for (let i = 0; i < h; i++) {
    const py0 = originY + frameH - (i + 1) * (tick + 1);
    for (let y = 0; y < tick; y++) {
      for (let x = 0; x < tick; x++) {
        const px = originX + frameW - tick - 1 + x;
        const py = py0 + y;
        const idx = (py * width + px) * 4;
        rgba[idx] = color[0];
        rgba[idx + 1] = color[1];
        rgba[idx + 2] = color[2];
        rgba[idx + 3] = 255;
      }
    }
  }
}

function drawFrame(rgba, width, originX, originY, frameW, frameH, base, border, marker, index, w, h) {
  for (let y = 0; y < frameH; y++) {
    for (let x = 0; x < frameW; x++) {
      const isBorder = x === 0 || y === 0 || x === frameW - 1 || y === frameH - 1;
      const color = isBorder ? border : base;
      const px = originX + x;
      const py = originY + y;
      const idx = (py * width + px) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = 255;
    }
  }
  drawIndexMarker(rgba, width, originX + 1, originY + 1, index, marker, base);
  drawFootprintSizeHint(rgba, width, originX, originY, frameW, frameH, w, h, marker);
}

// --- Layout: pack every base + variant frame left-to-right in one row,
// mirroring generateBuildingAtlas()'s own simple side-by-side layout so the
// packing strategy this replaces isn't a surprise. ---
const frames = [];
let atlasWidth = 0;
let atlasHeight = 0;

BUILDINGS.forEach((b, index) => {
  const w = b.w * TILE_SIZE;
  const h = b.h * TILE_SIZE;
  frames.push({
    name: `building-${b.type}`,
    x: atlasWidth,
    y: 0,
    w,
    h,
    category: b.category,
    index,
    tilesW: b.w,
    tilesH: b.h,
  });
  atlasWidth += w;
  atlasHeight = Math.max(atlasHeight, h);
});

VARIANT_FRAMES.forEach((v) => {
  const w = v.w * TILE_SIZE;
  const h = v.h * TILE_SIZE;
  frames.push({
    name: v.key,
    x: atlasWidth,
    y: 0,
    w,
    h,
    category: v.category,
    index: v.markerSeed,
    tilesW: v.w,
    tilesH: v.h,
  });
  atlasWidth += w;
  atlasHeight = Math.max(atlasHeight, h);
});

const rgba = Buffer.alloc(atlasWidth * atlasHeight * 4);

for (const frame of frames) {
  const base = CATEGORY_BASE_COLOR[frame.category];
  const marker = CATEGORY_MARKER_COLOR[frame.category];
  const border = lighten(base, BORDER_LIGHTEN);
  drawFrame(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h, base, border, marker, frame.index, frame.tilesW, frame.tilesH);
}

const png = encodePng(atlasWidth, atlasHeight, rgba);
const outDir = join(repoRoot, 'public', 'art');
mkdirSync(outDir, { recursive: true });
const pngPath = join(outDir, 'buildings-atlas.png');
writeFileSync(pngPath, png);

// Phaser 3/4 JSONHash atlas format: { frames: { "<name>": { frame: {x,y,w,h}, ... } }, meta: {...} }
const atlasJson = {
  frames: {},
  meta: {
    app: 'western-village-phaser tools/generate-placeholder-buildings.mjs',
    version: '1.0',
    image: 'buildings-atlas.png',
    format: 'RGBA8888',
    size: { w: atlasWidth, h: atlasHeight },
    scale: '1',
  },
};

for (const frame of frames) {
  atlasJson.frames[frame.name] = {
    frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h },
    sourceSize: { w: frame.w, h: frame.h },
  };
}

const jsonPath = join(outDir, 'buildings-atlas.json');
writeFileSync(jsonPath, JSON.stringify(atlasJson, null, 2));

console.log(`Wrote placeholder buildings atlas: ${pngPath} (${atlasWidth}x${atlasHeight}px, ${frames.length} frames)`);
console.log(`Wrote atlas JSON: ${jsonPath}`);
console.log('Frame names: ' + frames.map((f) => f.name).join(', '));
console.log('REMINDER: this is a PLACEHOLDER. Replace with real AI-generated art before shipping.');
