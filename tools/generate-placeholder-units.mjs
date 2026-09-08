// Phase 75 (player units, villagers, animals): generates PLACEHOLDER PNG+JSON
// atlases for the 6 small-unit texture keys this phase owns:
//   - public/art/animals-atlas.png/.json    (ANIMALS_ATLAS_KEY, 4 frames)
//   - public/art/cowboys-atlas.png/.json    (COWBOYS_ATLAS_KEY, 1 frame)
//   - public/art/mounted-cowboys-atlas.png/.json (MOUNTED_COWBOYS_ATLAS_KEY, 1 frame, non-square)
//   - public/art/brawlers-atlas.png/.json   (BRAWLERS_ATLAS_KEY, 1 frame)
//   - public/art/dynamiters-atlas.png/.json (DYNAMITERS_ATLAS_KEY, 1 frame)
//   - public/art/villagers-atlas.png/.json  (VILLAGERS_ATLAS_KEY, 1 frame)
//
// THIS IS NOT REAL ART. No AI-image-generation tool was available in the
// environment this was built in (see docs/phase_73_to_78_visual_overhaul_plan.md
// sections 2/3 for the real target art spec, and §5d/§4 Phase 75 for the
// 12px -> 18px size-increase decision this script's frame sizes reflect).
// This script exists purely to prove the loading pipeline end-to-end -
// correct file paths, correct per-frame dimensions (18x18, or 24x18 for the
// non-square mounted-cowboy frame), correct frame names exactly matching
// what animalTextureKey()/COWBOY_TEXTURE_KEY/etc. produce - with an obviously
// fake flat-color-plus-marker sprite per unit/animal kind, one distinguishable
// color per kind so they're tellable apart in-game. It must be replaced with
// real, AI-generated art before this overhaul is considered visually
// complete; see public/art/README.md.
//
// Usage: node tools/generate-placeholder-units.mjs
//
// IMPORTANT: SPRITE_SIZE/MOUNTED_WIDTH/MOUNTED_HEIGHT below are hand-
// transcribed mirrors of ANIMAL_SPRITE_SIZE/MOUNTED_COWBOY_SPRITE_WIDTH/
// MOUNTED_COWBOY_SPRITE_HEIGHT in src/config/buildingConfig.ts (plain Node,
// no TypeScript loader available, so this can't import the real .ts source
// directly - same constraint generate-placeholder-buildings.mjs documents).
// If those constants change again, update this table too, or
// tools/verify-unit-frames.mjs will start failing.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'public', 'art');
mkdirSync(outDir, { recursive: true });

// Mirrors buildingConfig.ts's ANIMAL_SPRITE_SIZE (Phase 75: 12 -> 18) and the
// MOUNTED_COWBOY_SPRITE_WIDTH/HEIGHT pair (24x18, same 4:3 ratio scaled up).
const SPRITE_SIZE = 18;
const MOUNTED_WIDTH = 24;
const MOUNTED_HEIGHT = 18;

const BORDER_LIGHTEN = 40;
const MARKER_DARKEN = 60;

function lighten([r, g, b], amount) {
  return [Math.min(255, r + amount), Math.min(255, g + amount), Math.min(255, b + amount)];
}

function darken([r, g, b], amount) {
  return [Math.max(0, r - amount), Math.max(0, g - amount), Math.max(0, b - amount)];
}

/**
 * Draws one flat-color placeholder frame into `rgba`: a solid base fill, a
 * lightened 1px border (frame-boundary tell, same convention
 * generate-placeholder-tiles.mjs/generate-placeholder-buildings.mjs use), and
 * a darkened corner marker block so two same-category frames are never
 * pixel-identical. Mirrors drawFrame() in generate-placeholder-buildings.mjs.
 */
function drawUnitFrame(rgba, atlasWidth, originX, originY, w, h, baseColor) {
  const border = lighten(baseColor, BORDER_LIGHTEN);
  const marker = darken(baseColor, MARKER_DARKEN);
  const markerSize = Math.max(2, Math.floor(Math.min(w, h) / 3));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isBorder = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const isMarker = x >= w - markerSize - 1 && x <= w - 2 && y >= h - markerSize - 1 && y <= h - 2;
      const color = isMarker ? marker : isBorder ? border : baseColor;
      const px = originX + x;
      const py = originY + y;
      const idx = (py * atlasWidth + px) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = 255;
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
    drawUnitFrame(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h, frame.color);
  }

  const png = encodePng(atlasWidth, atlasHeight, rgba);
  const pngPath = join(outDir, `${fileBaseName}.png`);
  writeFileSync(pngPath, png);

  const atlasJson = {
    frames: {},
    meta: {
      app: 'western-village-phaser tools/generate-placeholder-units.mjs',
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

// --- Animals (ANIMALS_ATLAS_KEY, animalTextureKey('<Kind>')) ---
writeAtlas('animals-atlas', [
  { name: 'animal-Chicken', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0xfa, 0xfa, 0xfa] }, // white
  { name: 'animal-Pig', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0xe8, 0xa5, 0xb8] }, // pink
  { name: 'animal-Cow', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0x6d, 0x4c, 0x41] }, // brown
  { name: 'animal-Ostrich', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0x42, 0x42, 0x42] }, // dark grey
]);

// --- Cowboy (COWBOYS_ATLAS_KEY, COWBOY_TEXTURE_KEY = 'cowboy') ---
writeAtlas('cowboys-atlas', [
  { name: 'cowboy', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0x8d, 0x67, 0x48] }, // tan/leather
]);

// --- Cowboy on Horse (MOUNTED_COWBOYS_ATLAS_KEY, MOUNTED_COWBOY_TEXTURE_KEY, non-square) ---
writeAtlas('mounted-cowboys-atlas', [
  { name: 'cowboy-on-horse', w: MOUNTED_WIDTH, h: MOUNTED_HEIGHT, color: [0x6d, 0x4c, 0x41] }, // saddle brown
]);

// --- Brawler (BRAWLERS_ATLAS_KEY, BRAWLER_TEXTURE_KEY = 'brawler') ---
writeAtlas('brawlers-atlas', [
  { name: 'brawler', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0xff, 0xca, 0x28] }, // knuckle gold
]);

// --- Dynamiter (DYNAMITERS_ATLAS_KEY, DYNAMITER_TEXTURE_KEY = 'dynamiter') ---
writeAtlas('dynamiters-atlas', [
  { name: 'dynamiter', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0xff, 0x70, 0x43] }, // fuse orange
]);

// --- Villager (VILLAGERS_ATLAS_KEY, VILLAGER_TEXTURE_KEY = 'villager') ---
writeAtlas('villagers-atlas', [
  { name: 'villager', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0xff, 0xcb, 0x8e] }, // skin/vest tan
]);

console.log('\nREMINDER: this is PLACEHOLDER art. Replace with real AI-generated art before shipping.');
