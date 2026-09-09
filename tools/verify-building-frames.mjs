// Verifies every frame name buildingTextureKey() can produce (base state,
// House tier2/tier3, WoodenGate closed) actually exists in its OWN
// per-building atlas JSON under public/art/buildings/<BuildingType>.json
// (asset-pipeline rework, 2026-09-09 - each building now has its own
// spriteset file instead of all 37 sharing one buildings-atlas.json).
//
// Size check is deliberately NOT an exact-pixel-match against the
// footprint: building textures are rendered via `setDisplaySize()` (see
// WorldVisualsSystem.createVisualForBuilding), so a 128x128 (4x
// supersampled) or a 32x32 (1x, e.g. an untouched placeholder) source both
// render correctly at the same on-screen tile footprint - source resolution
// is decoupled from footprint by design. What WOULD still break the game:
// (a) a frame whose size isn't a clean integer multiple of its building's
// footprint aspect ratio (a distorted/stretched sprite), or (b) two frames
// of the SAME building at different resolutions (a damage-state swap or
// tier upgrade would visibly snap to a different apparent scale, since
// Phaser's Image keeps whatever scaleX/scaleY setDisplaySize computed for
// the frame present at creation time rather than recomputing it on
// setFrame()/setTexture() - see resolveBuildingTexture's doc comment).
// Both of those are exactly what's checked below.
//
// Phase 89 - REACHABILITY CHECK (the check that would have caught the
// damage-rendering bug this phase fixed): it is no longer enough for a frame
// to merely EXIST in an atlas. Every frame present in an atlas must also be
// PRODUCIBLE by the real runtime resolution path (buildingTextureKey ->
// resolveBuildingFrameName / constructionFrameNameForTicks, all three
// mirrored below), simulated across every base variant, every damage band
// and every construction tick a building can actually occupy. An atlas frame
// no runtime state can ever select is a build-breaking FAILURE, not a
// silently-skipped optional extra - that exact gap is what let 34 buildings
// ship fully-generated Damaged/Ruined art that the game never once rendered,
// because resolveBuildingFrameName was looking up "Intact-Damaged" while
// every atlas names the frame plain "Damaged".
//
// Usage: node tools/verify-building-frames.mjs
// Exit code 0 = every building's atlas file exists, carries every required
// frame at a consistent size, and contains no unreachable frames.
// Exit code 1 = a building's atlas file is missing entirely, an expected
// frame is missing/wrong-size, a present frame is the wrong size for its
// declared dimensions, or a present frame is unreachable at runtime.
//
// Mirrors tools/generate-placeholder-buildings.mjs's hand-transcribed
// BUILDING_SIZES table - if a building is added, removed, or resized, BOTH
// files need updating together.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const TILE_SIZE = 32;

// type -> { w, h } in tiles. Mirrors buildingConfig.ts's BUILDING_DEFINITIONS
// size fields exactly (34 entries).
const BUILDING_SIZES = {
  OstrichFarm: { w: 2, h: 2 },
  Butcher: { w: 2, h: 2 },
  Well: { w: 1, h: 1 },
  House: { w: 1, h: 1 },
  Road: { w: 1, h: 1 },
  ChickenFarm: { w: 1, h: 1 },
  PigFarm: { w: 2, h: 2 },
  CowRanch: { w: 2, h: 2 },
  Fence: { w: 1, h: 1 },
  Gate: { w: 1, h: 1 },
  WoodenWall: { w: 1, h: 1 },
  WoodenGate: { w: 1, h: 1 },
  Warehouse: { w: 2, h: 2 },
  Granary: { w: 1, h: 1 },
  Supermarket: { w: 2, h: 2 },
  Barracks: { w: 2, h: 2 },
  Sewery: { w: 2, h: 2 },
  Forestry: { w: 2, h: 2 },
  WoodCutter: { w: 2, h: 2 },
  PotatoField: { w: 2, h: 2 },
  Liquor: { w: 2, h: 2 },
  Saloon: { w: 2, h: 2 },
  Horsery: { w: 2, h: 2 },
  Bank: { w: 2, h: 2 },
  CactusMilker: { w: 2, h: 2 },
  Watchtower: { w: 1, h: 1 },
  Quarry: { w: 2, h: 2 },
  IronMine: { w: 2, h: 2 },
  CoalMine: { w: 2, h: 2 },
  Blacksmith: { w: 2, h: 2 },
  TradingPost: { w: 2, h: 2 },
  WaterTower: { w: 1, h: 1 },
  Church: { w: 2, h: 2 },
  Brothel: { w: 2, h: 2 },
};

const expectedTypeCount = 34;
const typeNames = Object.keys(BUILDING_SIZES);
if (typeNames.length !== expectedTypeCount) {
  console.error(
    `[FAIL] BUILDING_SIZES table has ${typeNames.length} entries, expected ${expectedTypeCount}. ` +
      'Update this script (and generate-placeholder-buildings.mjs) to match buildingConfig.ts.',
  );
  process.exit(1);
}

/** Mirrors buildingTextureKey(type, tier, gateOpen) from buildingConfig.ts - note the
 * RETURN VALUE no longer includes a `building-${type}` prefix (the atlas itself is
 * now scoped to one building type, so that prefix would be redundant). */
function buildingTextureKey(type, tier, gateOpen) {
  if (type === 'House' && tier && tier > 1) {
    return `Tier${tier}`;
  }
  if (type === 'WoodenGate' && gateOpen === false) {
    return 'Closed';
  }
  return 'Intact';
}

// Every REQUIRED frame name per type (base state, plus House/WoodenGate's
// extra base-state variants) - every other building only requires 'Intact'.
function requiredFrameNamesForType(type) {
  return baseFrameNamesForType(type);
}

/** Every base (undamaged) frame a building can render, i.e. every distinct
 * buildingTextureKey() output for that type. */
function baseFrameNamesForType(type) {
  const names = [buildingTextureKey(type)];
  if (type === 'House') {
    names.push(buildingTextureKey(type, 2), buildingTextureKey(type, 3));
  }
  if (type === 'WoodenGate') {
    names.push(buildingTextureKey(type, undefined, false));
  }
  return names;
}

// --- Runtime resolution path, mirrored from src/config/buildingConfig.ts ---
// If either of these changes there, change it here too - the whole point of
// this script is that it exercises the SAME decision the game makes.

/** Mirrors damageStateFrameName(hp, maxHp). */
function damageStateFrameName(hp, maxHp) {
  if (maxHp <= 0) {
    return null;
  }
  const ratio = hp / maxHp;
  if (ratio < 0.34) {
    return 'Ruined';
  }
  if (ratio < 0.67) {
    return 'Damaged';
  }
  return null;
}

/** Mirrors resolveBuildingFrameName(baseFrame, hp, maxHp, frameExists). */
function resolveBuildingFrameName(baseFrame, hp, maxHp, frameExists) {
  const damageFrame = damageStateFrameName(hp, maxHp);
  if (!damageFrame) {
    return baseFrame;
  }
  const variantSpecific = `${baseFrame}-${damageFrame}`;
  if (frameExists(variantSpecific)) {
    return variantSpecific;
  }
  if (frameExists(damageFrame)) {
    return damageFrame;
  }
  return baseFrame;
}

/** Mirrors constructionFrameNameForTicks(ticksRemaining, totalTicks). */
function constructionFrameNameForTicks(ticksRemaining, totalTicks) {
  if (totalTicks <= 0) {
    return 'Construction75';
  }
  const builtTicks = totalTicks - ticksRemaining;
  if (builtTicks * 3 < totalTicks) {
    return 'Construction25';
  }
  if (builtTicks * 3 < totalTicks * 2) {
    return 'Construction50';
  }
  return 'Construction75';
}

// Mirrors constants.ts CONSTRUCTION_TICKS_1X1 / CONSTRUCTION_TICKS_2X2 and
// buildingConfig.ts getConstructionTicks (footprint area > 1 -> the 2x2 value).
const CONSTRUCTION_TICKS_1X1 = 3;
const CONSTRUCTION_TICKS_2X2 = 6;

/**
 * Every frame name the real runtime code can select for this building, given
 * the frames its atlas actually contains. Enumerated over:
 *  - construction: every ticksRemaining a building can occupy (total..1),
 *  - every base variant (Intact / Tier2 / Tier3 / Closed),
 *  - every damage band (full hp, mid-band Damaged, low-band Ruined).
 * Same shape as WorldVisualsSystem.resolveBuildingTexture, which is the one
 * and only place the game turns a PlacedBuilding into a frame name.
 */
function reachableFrameNames(type, size, framePresent) {
  const reachable = new Set();

  const totalTicks = size.w * size.h > 1 ? CONSTRUCTION_TICKS_2X2 : CONSTRUCTION_TICKS_1X1;
  for (let remaining = totalTicks; remaining >= 1; remaining--) {
    const name = constructionFrameNameForTicks(remaining, totalTicks);
    // resolveBuildingTexture falls back to 'Intact' if the construction frame
    // is absent, so an absent one is not reachable - only record real hits.
    reachable.add(framePresent(name) ? name : 'Intact');
  }

  const maxHp = 100;
  for (const baseFrame of baseFrameNamesForType(type)) {
    for (const hp of [maxHp, 50, 10]) {
      reachable.add(resolveBuildingFrameName(baseFrame, hp, maxHp, framePresent));
    }
  }

  return reachable;
}

function main() {
  let failed = false;
  let totalRequiredChecked = 0;
  let totalFramesChecked = 0;
  let totalReachabilityChecked = 0;

  for (const [type, size] of Object.entries(BUILDING_SIZES)) {
    const imagePath = join(repoRoot, 'public/art/buildings', `${type}.webp`);
    const jsonPath = join(repoRoot, 'public/art/buildings', `${type}.json`);

    if (!existsSync(imagePath)) {
      const stalePng = existsSync(join(repoRoot, 'public/art/buildings', `${type}.png`));
      console.error(
        `[FAIL] public/art/buildings/${type}.webp does not exist.` +
          (stalePng
            ? ' The .png does - BootScene.preload() only requests .webp. Run ' +
              '`python3 tools/asset_generation/convert_to_webp.py`.'
            : ''),
      );
      failed = true;
      continue;
    }
    if (!existsSync(jsonPath)) {
      console.error(`[FAIL] public/art/buildings/${type}.json does not exist.`);
      failed = true;
      continue;
    }

    let atlas;
    try {
      atlas = JSON.parse(readFileSync(jsonPath, 'utf8'));
    } catch (error) {
      console.error(`[FAIL] Could not parse public/art/buildings/${type}.json as JSON: ${error.message}`);
      failed = true;
      continue;
    }

    const frames = atlas.frames ?? {};
    let buildingFailed = false;

    // (1) every required frame name is present.
    const requiredNames = requiredFrameNamesForType(type);
    for (const name of requiredNames) {
      totalRequiredChecked++;
      if (!frames[name]) {
        console.error(`[FAIL] ${type}.json: missing required frame "${name}".`);
        failed = true;
        buildingFailed = true;
      }
    }

    // (2) every present frame's aspect ratio matches this building's real
    // footprint (size.w : size.h) - catches a distorted/stretched sprite,
    // independent of absolute resolution.
    let referenceSize = null; // (3) every frame is the SAME size as every other for this building.
    for (const [name, data] of Object.entries(frames)) {
      totalFramesChecked++;
      const { w, h } = data.frame ?? {};
      if (!w || !h) {
        console.error(`[FAIL] ${type}.json: frame "${name}" has no valid frame.w/frame.h.`);
        failed = true;
        buildingFailed = true;
        continue;
      }
      if (w * size.h !== h * size.w) {
        console.error(
          `[FAIL] ${type}.json: frame "${name}" is ${w}x${h}px, which isn't ${size.w}:${size.h} aspect ratio ` +
            `(${type}'s real footprint) - looks stretched/distorted.`,
        );
        failed = true;
        buildingFailed = true;
      }
      if (referenceSize === null) {
        referenceSize = { w, h, name };
      } else if (w !== referenceSize.w || h !== referenceSize.h) {
        console.error(
          `[FAIL] ${type}.json: frame "${name}" is ${w}x${h}px but frame "${referenceSize.name}" (same building) ` +
            `is ${referenceSize.w}x${referenceSize.h}px - every state frame for one building must render at the ` +
            'SAME resolution, or swapping between them (e.g. a damage-state change) will visibly snap to a ' +
            "different on-screen size (Phaser's setDisplaySize-derived scale is fixed at sprite-creation time, " +
            'not recomputed on setFrame()/setTexture()).',
        );
        failed = true;
        buildingFailed = true;
      }
    }

    // (4) Phase 89: every frame present in the atlas must be REACHABLE
    // through the real runtime resolution path. A frame that exists but can
    // never be selected is dead art the player downloads and never sees -
    // exactly the bug class this check was added for.
    const framePresent = (name) => Object.hasOwn(frames, name);
    const reachable = reachableFrameNames(type, size, framePresent);
    for (const name of Object.keys(frames)) {
      totalReachabilityChecked++;
      if (!reachable.has(name)) {
        console.error(
          `[FAIL] ${type}.json: frame "${name}" exists in the atlas but is UNREACHABLE - no combination of ` +
            'base variant, damage band or construction progress makes the game ever render it. Either the ' +
            'frame name is wrong, or buildingConfig.ts (buildingTextureKey / resolveBuildingFrameName / ' +
            'constructionFrameNameForTicks) needs to be able to select it. Dead art still costs the player ' +
            'a download.',
        );
        failed = true;
        buildingFailed = true;
      }
    }

    // (5) Explicit damage-state assertion, redundant with (4) but with a far
    // clearer failure message for the most likely regression.
    for (const damageFrame of ['Damaged', 'Ruined']) {
      if (!framePresent(damageFrame)) {
        continue;
      }
      const hp = damageFrame === 'Damaged' ? 50 : 10;
      const resolved = resolveBuildingFrameName('Intact', hp, 100, framePresent);
      if (resolved !== damageFrame) {
        console.error(
          `[FAIL] ${type}.json: has a "${damageFrame}" frame, but a building at ${hp}/100 hp resolves to ` +
            `"${resolved}" instead - damage art would never be shown in game.`,
        );
        failed = true;
        buildingFailed = true;
      }
    }

    if (!buildingFailed) {
      console.log(`[OK]   ${type}.json: ${Object.keys(frames).length} frame(s) at ${referenceSize.w}x${referenceSize.h}px, all present/consistent/reachable.`);
    }
  }

  console.log(`\nChecked ${typeNames.length} building atlases: ${totalRequiredChecked} required frame-name checks, ${totalFramesChecked} frames size/consistency-verified, ${totalReachabilityChecked} frames runtime-reachability-verified.`);

  if (failed) {
    console.error('\nBuilding frame-name verification FAILED. See errors above.');
    process.exit(1);
  }

  console.log('Building frame-name verification passed.');
}

main();
