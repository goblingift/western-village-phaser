// Phase 77 (vegetation, carts, accents): generates PLACEHOLDER PNG+JSON
// atlases for the 3 "world detail" texture keys this phase owns:
//   - public/art/vegetation-atlas.png/.json (VEGETATION_ATLAS_KEY, 2 frames)
//   - public/art/carts-atlas.png/.json      (CARTS_ATLAS_KEY, 1 frame)
//   - public/art/accents-atlas.png/.json    (ACCENTS_ATLAS_KEY, 6 frames)
//
// THIS IS NOT REAL ART. No AI-image-generation tool was available in the
// environment this was built in (see docs/phase_73_to_78_visual_overhaul_plan.md
// sections 1c/1j/1k, 2/3, and §5b.2 for the real target art spec and the
// accent carve-out alignment risk this script deliberately does NOT attempt
// to solve - see the note below). This script exists purely to prove the
// loading pipeline end-to-end - correct file paths, correct per-frame
// dimensions (including non-square shapes: cart 14x10, WellCrank's thin
// 16x4 bar, SupermarketAwning's wide 64x8 strip), correct frame names
// exactly matching what vegetationTextureKey()/CART_TEXTURE_KEY/
// accentTextureKey() produce - with an obviously fake flat-color-plus-marker
// sprite per kind. It must be replaced with real, AI-generated art before
// this overhaul is considered visually complete; see public/art/README.md.
//
// IMPORTANT NOTE on accents specifically: per the Phase 77 brief, the
// building art these accents are meant to be "carved out of" is itself only
// Phase 74 PLACEHOLDER flat-color art, not final art - so there is no real
// hole in the current building sprites for these placeholders to visually
// plug. This script's job is ONLY to get each accent frame's SIZE and NAME
// correct (verified by tools/verify-world-frames.mjs) so a future phase
// (after both real building art and real accent art exist) can verify actual
// pixel alignment. Every accent's position/origin/pivot/tween lives in
// MainScene.ts and is completely untouched by this script or Phase 77.
//
// Usage: node tools/generate-placeholder-world.mjs
//
// IMPORTANT: the size/shape values below are hand-transcribed mirrors of
// src/config/buildingConfig.ts (CART_SPRITE_WIDTH/HEIGHT, and the accent
// frame sizes read directly out of BootScene.ts's now-deleted
// ACCENT_SPRITES pattern definitions before they were removed) and
// src/config/vegetationConfig.ts (VEGETATION_ATLAS_KEY's frame naming, tile-
// sized at TILE_SIZE) - plain Node, no TypeScript loader available, same
// constraint every other tools/generate-placeholder-*.mjs script documents.
// If any of these sizes change again, update this table (and
// tools/verify-world-frames.mjs) together.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'public', 'art');
mkdirSync(outDir, { recursive: true });

const TILE_SIZE = 32;

const BORDER_LIGHTEN = 40;
const MARKER_DARKEN = 60;

function lighten([r, g, b], amount) {
  return [Math.min(255, r + amount), Math.min(255, g + amount), Math.min(255, b + amount)];
}

function darken([r, g, b], amount) {
  return [Math.max(0, r - amount), Math.max(0, g - amount), Math.max(0, b - amount)];
}

function setPx(rgba, atlasWidth, x, y, color) {
  const idx = (y * atlasWidth + x) * 4;
  rgba[idx] = color[0];
  rgba[idx + 1] = color[1];
  rgba[idx + 2] = color[2];
  rgba[idx + 3] = 255;
}

/**
 * Base placeholder frame: solid fill, lightened 1px border (frame-boundary
 * tell), darkened corner marker block - same convention every other
 * generate-placeholder-*.mjs script in this repo uses, so a placeholder
 * always visually announces itself regardless of category. For very thin
 * frames (e.g. WellCrank's 16x4 bar) the border/marker degrade gracefully:
 * a 1px border on a 4px-tall frame is still clearly visible, and the marker
 * is sized relative to min(w,h) so it never overruns a thin dimension.
 */
function drawBaseFrame(rgba, atlasWidth, originX, originY, w, h, baseColor) {
  const border = lighten(baseColor, BORDER_LIGHTEN);
  const marker = darken(baseColor, MARKER_DARKEN);
  const markerSize = Math.max(1, Math.floor(Math.min(w, h) / 3));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isBorder = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const isMarker = x >= w - markerSize - 1 && x <= w - 2 && y >= h - markerSize - 1 && y <= h - 2;
      const color = isMarker ? marker : isBorder ? border : baseColor;
      setPx(rgba, atlasWidth, originX + x, originY + y, color);
    }
  }
}

/**
 * Shape-readability requirement (Phase 77 brief): a placeholder's rectangular
 * aspect ratio must be visually obvious, not just "a solid color that happens
 * to be that shape" - important because verifying the shape round-trips
 * correctly through the atlas packer is part of what this phase proves. On
 * top of the base border/marker frame, this draws alternating light/dark
 * horizontal stripes across the frame's full width whenever a frame is much
 * wider than it is tall (aspect ratio >= 2), or vertical stripes when much
 * taller than wide - e.g. WellCrank (16x4, ratio 4) gets horizontal banding
 * that reads as "a thin bar", SupermarketAwning (64x8, ratio 8) the same.
 * Square-ish frames (accents like WarehouseDoor at 24x24, or vegetation/cart
 * frames) skip this since their own border+marker already reads as a
 * self-contained shape at that aspect ratio.
 */
function drawAspectRatioStripes(rgba, atlasWidth, originX, originY, w, h, baseColor) {
  const stripeColor = lighten(baseColor, 70);
  const ratio = w / h;
  if (ratio >= 2) {
    // Wide/thin bar: horizontal stripes every other row (skip the 1px border rows).
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x++) {
        setPx(rgba, atlasWidth, originX + x, originY + y, stripeColor);
      }
    }
  } else if (ratio <= 0.5) {
    // Tall/narrow bar: vertical stripes every other column.
    for (let x = 1; x < w - 1; x += 2) {
      for (let y = 1; y < h - 1; y++) {
        setPx(rgba, atlasWidth, originX + x, originY + y, stripeColor);
      }
    }
  }
}

function writeAtlas(fileBaseName, frames) {
  let atlasWidth = 0;
  let atlasHeight = 0;
  const laidOut = frames.map((f) => {
    const x = atlasWidth;
    atlasWidth += f.w;
    atlasHeight = Math.max(atlasHeight, f.h);
    return { ...f, x, y: 0 };
  });

  const rgba = Buffer.alloc(atlasWidth * atlasHeight * 4);
  for (const frame of laidOut) {
    drawBaseFrame(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h, frame.color);
    drawAspectRatioStripes(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h, frame.color);
  }

  const png = encodePng(atlasWidth, atlasHeight, rgba);
  const pngPath = join(outDir, `${fileBaseName}.png`);
  writeFileSync(pngPath, png);

  const atlasJson = {
    frames: {},
    meta: {
      app: 'western-village-phaser tools/generate-placeholder-world.mjs',
      version: '1.0',
      image: `${fileBaseName}.png`,
      format: 'RGBA8888',
      size: { w: atlasWidth, h: atlasHeight },
      scale: '1',
    },
  };
  for (const frame of laidOut) {
    atlasJson.frames[frame.name] = {
      frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h },
      sourceSize: { w: frame.w, h: frame.h },
    };
  }
  const jsonPath = join(outDir, `${fileBaseName}.json`);
  writeFileSync(jsonPath, JSON.stringify(atlasJson, null, 2));

  console.log(
    `Wrote placeholder ${fileBaseName}: ${pngPath} (${atlasWidth}x${atlasHeight}px, ${laidOut.length} frame(s))`,
  );
  console.log('  Frame names: ' + laidOut.map((f) => f.name).join(', '));
}

// --- Vegetation (VEGETATION_ATLAS_KEY, vegetationTextureKey('<Kind>')) ---
// Tile-sized (32x32), unaffected by Phase 75's 12->18 small-unit bump - a
// tree/cactus occupies a whole tile, not a small-unit slot.
writeAtlas('vegetation-atlas', [
  { name: 'vegetation-Tree', w: TILE_SIZE, h: TILE_SIZE, color: [0x2e, 0x7d, 0x32] }, // forest green
  { name: 'vegetation-Cactus', w: TILE_SIZE, h: TILE_SIZE, color: [0x68, 0x9f, 0x38] }, // sage green
]);

// --- Goods cart (CARTS_ATLAS_KEY, CART_TEXTURE_KEY = 'goods-cart') ---
// 14x10, non-square, independent literals (CART_SPRITE_WIDTH/HEIGHT) not
// derived from ANIMAL_SPRITE_SIZE - confirmed unaffected by Phase 75's bump.
writeAtlas('carts-atlas', [
  { name: 'goods-cart', w: 14, h: 10, color: [0x6d, 0x4c, 0x41] }, // wagon-bed brown
]);

// --- Accents (ACCENTS_ATLAS_KEY, accentTextureKey('<Kind>')) ---
// Sizes below are read directly from MainScene.ts's accent creation call
// sites / BootScene.ts's (now-removed) ACCENT_SPRITES pattern definitions -
// NOT invented for this phase. Each gets its own distinguishable color AND
// (via drawAspectRatioStripes above) a shape-readable stripe treatment when
// its aspect ratio is extreme, so the atlas-packer round-trip of a non-square
// shape (e.g. WellCrank's 16x4 thin bar, SupermarketAwning's 64x8 wide strip)
// is visually obvious, not just inferred from a solid color block.
writeAtlas('accents-atlas', [
  // 16x4: thin crank bar (pattern ['CCCC'] at PIXEL_SIZE 4 -> 4 cols x 1 row x 4px = 16x4).
  { name: 'accent-WellCrank', w: 16, h: 4, color: [0x42, 0x42, 0x42] }, // iron grey
  // 24x24: 6x6 pattern at PIXEL_SIZE 4.
  { name: 'accent-WarehouseDoor', w: 24, h: 24, color: [0x6d, 0x4c, 0x41] }, // plank brown
  // 64x8: 16x2 pattern at PIXEL_SIZE 4.
  { name: 'accent-SupermarketAwning', w: 64, h: 8, color: [0xce, 0x93, 0xd8] }, // awning purple
  // 16x12: 4x3 pattern at PIXEL_SIZE 4.
  { name: 'accent-ChickenDoor', w: 16, h: 12, color: [0xff, 0xf8, 0xe1] }, // coop cream
  // 12x12: 3x3 pattern at PIXEL_SIZE 4.
  { name: 'accent-HouseWindowLight', w: 12, h: 12, color: [0xff, 0xe0, 0x82] }, // lamp gold
  // 12x12: 3x3 pattern at PIXEL_SIZE 4.
  { name: 'accent-Campfire', w: 12, h: 12, color: [0xff, 0x70, 0x43] }, // fire orange
]);

console.log('\nREMINDER: this is PLACEHOLDER art. Replace with real AI-generated art before shipping.');
