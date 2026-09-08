// Phase 78 (resource icons, HUD polish): generates a PLACEHOLDER PNG+JSON
// atlas for the last remaining texture key from the visual overhaul plan:
//   - public/art/resource-icons-atlas.png/.json (RESOURCE_ICONS_ATLAS_KEY, 15 frames)
//
// THIS IS NOT REAL ART. No AI-image-generation tool was available in the
// environment this was built in (see docs/phase_73_to_78_visual_overhaul_plan.md
// §1l/§2/§3 for the real target art spec). This script exists purely to prove
// the loading pipeline end-to-end - correct file path, correct per-frame
// dimensions (12x12, RESOURCE_ICON_SIZE - a HUD-chrome size independent of
// Phase 75/76's 12->18 small-unit-sprite bump, confirmed by grep: nothing
// aliases RESOURCE_ICON_SIZE to ANIMAL_SPRITE_SIZE), correct frame names
// exactly matching what resourceIconTextureKey() produces for every
// ResourceKey - with an obviously fake flat-color-plus-marker sprite per
// resource, using a natural color association per resource (red-ish for
// meat, blue for water, brown for wood/logs, grey for stone/iron/tools,
// near-black for coal, etc.) so icons are tellable apart in the HUD even as
// placeholders. It must be replaced with real, AI-generated art before this
// overhaul is considered visually complete; see public/art/README.md.
//
// Usage: node tools/generate-placeholder-resource-icons.mjs
//
// IMPORTANT: the RESOURCE_KEYS list and RESOURCE_ICON_SIZE below are
// hand-transcribed mirrors of src/config/buildingConfig.ts's ResourceKey type/
// RESOURCE_ICON_SIZE constant - plain Node, no TypeScript loader available,
// same constraint every other tools/generate-placeholder-*.mjs script
// documents. If ResourceKey ever gains/loses/renames an entry, update this
// table (and tools/verify-resource-icon-frames.mjs) together.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'public', 'art');
mkdirSync(outDir, { recursive: true });

// Mirrors buildingConfig.ts's RESOURCE_ICON_SIZE (12px, unaffected by the
// Phase 75/76 12->18 small-unit-sprite change - resource icons are HUD chrome
// with their own independent constant, not an ANIMAL_SPRITE_SIZE alias).
const ICON_SIZE = 12;

const BORDER_LIGHTEN = 40;
const MARKER_DARKEN = 60;

function lighten([r, g, b], amount) {
  return [Math.min(255, r + amount), Math.min(255, g + amount), Math.min(255, b + amount)];
}

function darken([r, g, b], amount) {
  return [Math.max(0, r - amount), Math.max(0, g - amount), Math.max(0, b - amount)];
}

/**
 * Same base-frame convention every other generate-placeholder-*.mjs script in
 * this repo uses: solid fill, lightened 1px border (frame-boundary tell),
 * darkened corner marker block, so a placeholder always visually announces
 * itself and two resources are never pixel-identical.
 */
function drawIconFrame(rgba, atlasWidth, originX, originY, w, h, baseColor) {
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
    drawIconFrame(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h, frame.color);
  }

  const png = encodePng(atlasWidth, atlasHeight, rgba);
  const pngPath = join(outDir, `${fileBaseName}.png`);
  writeFileSync(pngPath, png);

  const atlasJson = {
    frames: {},
    meta: {
      app: 'western-village-phaser tools/generate-placeholder-resource-icons.mjs',
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

// --- Resource icons (RESOURCE_ICONS_ATLAS_KEY, resourceIconTextureKey('<ResourceKey>')) ---
// Mirrors src/config/buildingConfig.ts's ResourceKey union exactly (15 keys).
// One flat, distinguishable color per resource with a natural association
// where one exists (reddish for meat, blue for water, brown for wood/logs,
// grey for stone/iron/tools, near-black for coal, green for agave juice,
// amber for liquor, etc.) so icons remain tellable apart in a dense HUD grid
// even as flat-color placeholders.
writeAtlas('resource-icons-atlas', [
  { name: 'resource-icon-rawMeat', w: ICON_SIZE, h: ICON_SIZE, color: [0xd0, 0x5a, 0x6e] }, // raw red
  { name: 'resource-icon-meat', w: ICON_SIZE, h: ICON_SIZE, color: [0x8d, 0x3b, 0x2f] }, // cooked dark red
  { name: 'resource-icon-water', w: ICON_SIZE, h: ICON_SIZE, color: [0x2f, 0x7f, 0xbf] }, // water blue
  { name: 'resource-icon-eggs', w: ICON_SIZE, h: ICON_SIZE, color: [0xff, 0xf8, 0xe1] }, // eggshell cream
  { name: 'resource-icon-leather', w: ICON_SIZE, h: ICON_SIZE, color: [0x9c, 0x6b, 0x3f] }, // tanned hide
  { name: 'resource-icon-clothes', w: ICON_SIZE, h: ICON_SIZE, color: [0x5c, 0x6b, 0xc0] }, // dyed cloth blue-violet
  { name: 'resource-icon-logs', w: ICON_SIZE, h: ICON_SIZE, color: [0x8d, 0x67, 0x48] }, // bark brown
  { name: 'resource-icon-wood', w: ICON_SIZE, h: ICON_SIZE, color: [0xc9, 0xa0, 0x63] }, // milled plank tan
  { name: 'resource-icon-potatoes', w: ICON_SIZE, h: ICON_SIZE, color: [0xc9, 0xa0, 0x63] }, // earthy tan
  { name: 'resource-icon-liquor', w: ICON_SIZE, h: ICON_SIZE, color: [0xd2, 0x82, 0x3a] }, // amber
  { name: 'resource-icon-agaveJuice', w: ICON_SIZE, h: ICON_SIZE, color: [0x7c, 0xb3, 0x42] }, // agave green
  { name: 'resource-icon-stone', w: ICON_SIZE, h: ICON_SIZE, color: [0x9e, 0x9e, 0x9e] }, // grey
  { name: 'resource-icon-iron', w: ICON_SIZE, h: ICON_SIZE, color: [0xbf, 0x36, 0x0c] }, // rust-orange ore
  { name: 'resource-icon-tools', w: ICON_SIZE, h: ICON_SIZE, color: [0x61, 0x61, 0x61] }, // steel grey
  { name: 'resource-icon-coal', w: ICON_SIZE, h: ICON_SIZE, color: [0x21, 0x21, 0x21] }, // near-black
]);

console.log('\nREMINDER: this is PLACEHOLDER art. Replace with real AI-generated art before shipping.');
