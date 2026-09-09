// Generates PLACEHOLDER per-building atlases: public/art/buildings/<BuildingType>.png
// + .json, one file pair per BuildingType, replacing the old single shared
// buildings-atlas.png/.json (asset-pipeline rework, 2026-09-09 - each
// building now gets its own spriteset file so it can carry its own
// Intact/Damaged/Ruined/Construction*/Tier* state frames without colliding
// with every other building's frame-name space).
//
// THIS IS NOT REAL ART. This script exists purely to prove the loading
// pipeline end-to-end - correct file paths, correct per-frame dimensions
// (derived from each building's real footprint, never hardcoded), correct
// frame names exactly matching what `buildingTextureKey()` produces - with
// an obviously fake flat-color-plus-marker sprite per building. Real
// AI-generated art (tools/asset_generation/) replaces these one building at
// a time; see public/art/README.md.
//
// Usage: node tools/generate-placeholder-buildings.mjs
//
// IMPORTANT: the `BUILDINGS` table below is a hand-transcribed mirror of
// src/config/buildingConfig.ts's BUILDING_DEFINITIONS (type, footprint size,
// category) - this script is plain Node (no TypeScript loader available), so
// it cannot import the real .ts source directly. If a building is added,
// removed, resized, or recategorized in buildingConfig.ts, this table must be
// updated to match, or `node tools/verify-building-frames.mjs` will start
// failing (missing/extra frame names, wrong dimensions) - which is the
// intended guard rail, not a bug.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TILE_SIZE = 32;

// One row per BuildingType, in BUILDING_DEFINITIONS' own declaration order.
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
  // Phase 92: always-unlocked basic-goods seller (real generated art shipped;
  // this entry exists so a placeholder regeneration stays complete).
  { type: 'MarketStall', w: 1, h: 1, category: 'Commerce' },
  { type: 'Gunsmith', w: 2, h: 2, category: 'Industry' },
];

if (BUILDINGS.length !== 36) {
  throw new Error(`Expected 36 BuildingType entries, found ${BUILDINGS.length}. Update this table.`);
}

// Every frame name buildingTextureKey() can produce for a given building
// type (buildingConfig.ts) - most buildings only ever have 'Intact'; House
// and WoodenGate are the two with extra base-state frames.
function framesForBuilding(type) {
  if (type === 'House') {
    return ['Intact', 'Tier2', 'Tier3'];
  }
  if (type === 'WoodenGate') {
    return ['Intact', 'Closed'];
  }
  return ['Intact'];
}

const CATEGORY_BASE_COLOR = {
  Housing: [0xff, 0xb3, 0x00],
  Barriers: [0x8d, 0x6e, 0x63],
  Livestock: [0x8b, 0xc3, 0x4a],
  Farming: [0x2e, 0x7d, 0x32],
  Industry: [0xe6, 0x51, 0x00],
  Commerce: [0x8e, 0x24, 0xaa],
  Military: [0x37, 0x47, 0x4f],
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

function drawIndexMarker(rgba, width, originX, originY, index, markerColor, bgColor) {
  const bits = index & 0xf;
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

const outDir = join(repoRoot, 'public', 'art', 'buildings');
// Clean slate: an old run's leftover per-building files for a since-removed
// BuildingType would otherwise linger forever (nothing else in this script
// deletes stale files by name).
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true });
}
mkdirSync(outDir, { recursive: true });

let totalFrames = 0;

BUILDINGS.forEach((b, index) => {
  const frameW = b.w * TILE_SIZE;
  const frameH = b.h * TILE_SIZE;
  const frameNames = framesForBuilding(b.type);
  const base = CATEGORY_BASE_COLOR[b.category];
  const marker = CATEGORY_MARKER_COLOR[b.category];
  const border = lighten(base, BORDER_LIGHTEN);

  const atlasWidth = frameW * frameNames.length;
  const atlasHeight = frameH;
  const rgba = Buffer.alloc(atlasWidth * atlasHeight * 4);

  const frames = frameNames.map((name, frameIndex) => ({
    name,
    x: frameIndex * frameW,
    y: 0,
    w: frameW,
    h: frameH,
  }));

  for (const frame of frames) {
    drawFrame(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h, base, border, marker, index, b.w, b.h);
  }

  const png = encodePng(atlasWidth, atlasHeight, rgba);
  const pngPath = join(outDir, `${b.type}.png`);
  writeFileSync(pngPath, png);

  const atlasJson = {
    frames: {},
    meta: {
      app: 'western-village-phaser tools/generate-placeholder-buildings.mjs',
      version: '1.0',
      image: `${b.type}.png`,
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
  writeFileSync(join(outDir, `${b.type}.json`), JSON.stringify(atlasJson, null, 2));

  totalFrames += frames.length;
});

console.log(`Wrote ${BUILDINGS.length} placeholder building atlases (${totalFrames} total frames) to ${outDir}`);
console.log('REMINDER: this is PLACEHOLDER art. Replace one building at a time with tools/asset_generation/.');
