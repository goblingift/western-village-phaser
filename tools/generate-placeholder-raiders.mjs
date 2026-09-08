// Phase 76 (raiders, raider camps, wildlife): generates PLACEHOLDER PNG+JSON
// atlases for the 3 hostile-unit texture keys this phase owns:
//   - public/art/raiders-atlas.png/.json       (RAIDERS_ATLAS_KEY, 3 frames)
//   - public/art/raider-camps-atlas.png/.json  (RAIDER_CAMPS_ATLAS_KEY, 3 frames)
//   - public/art/wildlife-atlas.png/.json      (WILDLIFE_ATLAS_KEY, 3 frames)
//
// THIS IS NOT REAL ART. No AI-image-generation tool was available in the
// environment this was built in (see docs/phase_73_to_78_visual_overhaul_plan.md
// sections 1g/1h/1i, 2/3, and §5f/§5g for the real target art spec and the
// resolved raider-vs-wildlife-Coyote / per-faction-camp differentiation
// decisions this script's markers encode). This script exists purely to
// prove the loading pipeline end-to-end - correct file paths, correct
// per-frame dimensions (18x18 for raiders/wildlife per Phase 76's
// WILDLIFE_SPRITE_SIZE 12->18 bump, 24x18 for raider camps, unaffected by
// that bump), correct frame names exactly matching what
// raiderTextureKey()/raiderCampTextureKey()/wildlifeTextureKey() produce -
// with an obviously fake flat-color-plus-marker sprite per faction/kind. It
// must be replaced with real, AI-generated art before this overhaul is
// considered visually complete; see public/art/README.md.
//
// Usage: node tools/generate-placeholder-raiders.mjs
//
// IMPORTANT: SPRITE_SIZE/CAMP_SIZE below are hand-transcribed mirrors of
// RAIDER_SPRITE_SIZE (src/config/buildingConfig.ts, itself an alias of
// ANIMAL_SPRITE_SIZE)/WILDLIFE_SPRITE_SIZE (src/config/wildlifeConfig.ts)/
// RAIDER_CAMP_SPRITE_SIZE (src/config/buildingConfig.ts) - plain Node, no
// TypeScript loader available, same constraint generate-placeholder-units.mjs
// documents. If those constants change again, update this table too, or
// tools/verify-raider-frames.mjs will start failing.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './png-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'public', 'art');
mkdirSync(outDir, { recursive: true });

// Mirrors RAIDER_SPRITE_SIZE/WILDLIFE_SPRITE_SIZE (Phase 76: wildlife 12 -> 18
// to match the raider/player-unit small-unit class) and RAIDER_CAMP_SPRITE_SIZE
// (24, independent literal, NOT touched by this phase's size bump).
const SPRITE_SIZE = 18;
const CAMP_SIZE = 24;

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
 * tell), darkened bottom-right corner marker block - same convention
 * generate-placeholder-units.mjs/generate-placeholder-buildings.mjs use, so a
 * placeholder always visually announces itself as one regardless of category.
 */
function drawBaseFrame(rgba, atlasWidth, originX, originY, w, h, baseColor) {
  const border = lighten(baseColor, BORDER_LIGHTEN);
  const marker = darken(baseColor, MARKER_DARKEN);
  const markerSize = Math.max(2, Math.floor(Math.min(w, h) / 3));

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
 * Phase 76 §5f (resolved: differentiate): the raid-faction Coyote and the
 * ambient wildlife Coyote share the same base tan/brown color family (both
 * "read as a coyote"), but the raid version additionally gets a small red
 * "bandana" stripe across its neck/upper-body band - a stand-in for the
 * plan's real-art direction ("give raid-Coyote a bandana/scar marker"). The
 * wildlife Coyote frame gets NO such stripe. This is drawn as a distinct
 * horizontal band near the top third of the frame, independent of the
 * existing corner marker (which both frames still get, like every other
 * placeholder) so the two tells don't collide.
 */
function drawBandanaStripe(rgba, atlasWidth, originX, originY, w, h) {
  const stripeColor = [0xb7, 0x1c, 0x1c]; // barn-red bandana accent
  const stripeY = Math.floor(h / 3);
  const stripeHeight = Math.max(2, Math.floor(h / 9));
  for (let y = stripeY; y < stripeY + stripeHeight; y++) {
    for (let x = 1; x < w - 1; x++) {
      setPx(rgba, atlasWidth, originX + x, originY + y, stripeColor);
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
    if (frame.extraMarker === 'bandana') {
      drawBandanaStripe(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h);
    }
  }

  const png = encodePng(atlasWidth, atlasHeight, rgba);
  const pngPath = join(outDir, `${fileBaseName}.png`);
  writeFileSync(pngPath, png);

  const atlasJson = {
    frames: {},
    meta: {
      app: 'western-village-phaser tools/generate-placeholder-raiders.mjs',
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

/**
 * Phase 76 §5g (raider camps "differentiate beyond tent colour"): each camp
 * frame gets a distinct small corner-icon shape (not just a different flat
 * fill) drawn in the top-left corner (opposite the existing bottom-right
 * corner marker every placeholder frame already gets), one distinct
 * per-faction pixel shape each:
 *   - Outlaws: a small diagonal "rifle" line (stacked arms idiom)
 *   - Rustlers: a small square "pen/corral" outline (roped stock idiom)
 *   - Coyotes: a small scattered 3-dot "bone pile" idiom
 * This is on top of (not instead of) each camp already having its own
 * distinct base/tent color, matching the plan's "vary a secondary visual
 * element too" instruction. Called directly per-frame below (each faction
 * needs its own icon-drawing function, so there's no single shared
 * `extraMarker` dispatch the way the bandana-stripe raider marker uses).
 */
function drawRifleIcon(rgba, atlasWidth, originX, originY, color) {
  // Diagonal line from (2,2) to (6,6) - a stacked-rifle silhouette stand-in.
  for (let i = 0; i < 5; i++) {
    setPx(rgba, atlasWidth, originX + 2 + i, originY + 2 + i, color);
  }
}

function drawCorralIcon(rgba, atlasWidth, originX, originY, color) {
  // Small square outline (3x3 box, 2..5) - a corral/pen silhouette stand-in.
  const x0 = originX + 2;
  const y0 = originY + 2;
  const size = 4;
  for (let i = 0; i < size; i++) {
    setPx(rgba, atlasWidth, x0 + i, y0, color);
    setPx(rgba, atlasWidth, x0 + i, y0 + size - 1, color);
    setPx(rgba, atlasWidth, x0, y0 + i, color);
    setPx(rgba, atlasWidth, x0 + size - 1, y0 + i, color);
  }
}

function drawBonePileIcon(rgba, atlasWidth, originX, originY, color) {
  // Three scattered single pixels - a scrappy "bone pile" silhouette stand-in.
  setPx(rgba, atlasWidth, originX + 2, originY + 2, color);
  setPx(rgba, atlasWidth, originX + 5, originY + 3, color);
  setPx(rgba, atlasWidth, originX + 3, originY + 5, color);
}

// --- Raiders (RAIDERS_ATLAS_KEY, raiderTextureKey('<Faction>')) ---
// One distinguishable base color per faction, matching the existing
// procedural RAIDER_SPRITES' relative palette relationship (Outlaws darkest/
// near-black, Rustlers olive/tan, Coyotes tan/brown - the wildlife Coyote
// below shares this Coyotes base color family per §5f, differentiated only by
// the bandana stripe).
writeAtlas('raiders-atlas', [
  { name: 'raider-Outlaws', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0x21, 0x21, 0x21] }, // near-black
  { name: 'raider-Rustlers', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0x6d, 0x5a, 0x3a] }, // olive/tan
  {
    name: 'raider-Coyotes',
    w: SPRITE_SIZE,
    h: SPRITE_SIZE,
    color: [0xbf, 0xa9, 0x80], // same tan/brown family as wildlife-Coyote below
    extraMarker: 'bandana', // §5f: distinguishes raid-Coyote from ambient wildlife-Coyote
  },
]);

// --- Wildlife (WILDLIFE_ATLAS_KEY, wildlifeTextureKey('<Kind>')) ---
writeAtlas('wildlife-atlas', [
  { name: 'wildlife-Snake', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0x55, 0x6b, 0x2f] }, // olive-green
  {
    name: 'wildlife-Coyote',
    w: SPRITE_SIZE,
    h: SPRITE_SIZE,
    color: [0xbf, 0xa9, 0x80], // same tan/brown family as raider-Coyotes above - deliberately NO bandana
  },
  { name: 'wildlife-MountainLion', w: SPRITE_SIZE, h: SPRITE_SIZE, color: [0xc9, 0xa8, 0x6a] }, // sandy tan
]);

// --- Raider camps (RAIDER_CAMPS_ATLAS_KEY, raiderCampTextureKey('<Faction>')) ---
// §5g: distinct tent-canvas base color AND a distinct per-faction corner-icon
// shape (drawn directly below, not via the generic writeAtlas extraMarker
// hook, since each faction needs its own icon shape rather than one shared
// drawer).
{
  const campFrames = [
    { name: 'raider-camp-Outlaws', color: [0x37, 0x47, 0x4f], icon: drawRifleIcon }, // slate tent
    { name: 'raider-camp-Rustlers', color: [0x6d, 0x5a, 0x3a], icon: drawCorralIcon }, // olive tent
    { name: 'raider-camp-Coyotes', color: [0xbf, 0xa9, 0x80], icon: drawBonePileIcon }, // tan tent
  ];

  let atlasWidth = 0;
  let atlasHeight = 0;
  const laidOut = campFrames.map((f) => {
    const x = atlasWidth;
    atlasWidth += CAMP_SIZE;
    atlasHeight = Math.max(atlasHeight, CAMP_SIZE);
    return { ...f, x, y: 0, w: CAMP_SIZE, h: CAMP_SIZE };
  });

  const rgba = Buffer.alloc(atlasWidth * atlasHeight * 4);
  for (const frame of laidOut) {
    drawBaseFrame(rgba, atlasWidth, frame.x, frame.y, frame.w, frame.h, frame.color);
    const iconColor = lighten(frame.color, 90);
    frame.icon(rgba, atlasWidth, frame.x, frame.y, iconColor);
  }

  const png = encodePng(atlasWidth, atlasHeight, rgba);
  const pngPath = join(outDir, 'raider-camps-atlas.png');
  writeFileSync(pngPath, png);

  const atlasJson = {
    frames: {},
    meta: {
      app: 'western-village-phaser tools/generate-placeholder-raiders.mjs',
      version: '1.0',
      image: 'raider-camps-atlas.png',
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
  const jsonPath = join(outDir, 'raider-camps-atlas.json');
  writeFileSync(jsonPath, JSON.stringify(atlasJson, null, 2));

  console.log(
    `Wrote placeholder raider-camps-atlas: ${pngPath} (${atlasWidth}x${atlasHeight}px, ${laidOut.length} frame(s))`,
  );
  console.log('  Frame names: ' + laidOut.map((f) => f.name).join(', '));
}

console.log('\nREMINDER: this is PLACEHOLDER art. Replace with real AI-generated art before shipping.');
