import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import {
  ACCENTS_ATLAS_KEY,
  ANIMALS_ATLAS_KEY,
  BRAWLERS_ATLAS_KEY,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingType,
  CARTS_ATLAS_KEY,
  COWBOYS_ATLAS_KEY,
  DYNAMITERS_ATLAS_KEY,
  MOUNTED_COWBOYS_ATLAS_KEY,
  RAIDERS_ATLAS_KEY,
  RAIDER_CAMPS_ATLAS_KEY,
  RESOURCE_ICONS_ATLAS_KEY,
  RESOURCE_ICON_SIZE,
  ResourceKey,
  VILLAGERS_ATLAS_KEY,
  buildingTextureKey,
  resourceIconTextureKey,
} from '../config/buildingConfig';
import { VEGETATION_ATLAS_KEY } from '../config/vegetationConfig';
import { WILDLIFE_ATLAS_KEY } from '../config/wildlifeConfig';
import { setBuildingIcons } from '../ui/buildingIcons';

export const TILESET_KEY = 'tiles-atlas';

/**
 * All sprites are drawn on a logical pixel grid, then scaled up to TILE_SIZE
 * to get a chunky "pixel art" look without loading external image assets.
 * PIXEL_GRID is the number of logical pixels per tile edge (8x8 per tile),
 * so PIXEL_SIZE (TILE_SIZE / PIXEL_GRID) is how many real pixels each
 * logical pixel occupies once rasterized into the texture.
 */
const PIXEL_GRID = 8;
const PIXEL_SIZE = TILE_SIZE / PIXEL_GRID;

/**
 * Small-sprite logical grid (6x6), originally shared by every small-unit
 * procedural generator (animals, raiders, wildlife, etc.). Phases 74-77
 * migrated every one of those categories (plus buildings, vegetation, carts
 * and accents) to loaded PNG atlases one by one; the only remaining consumer
 * is generateResourceIconAtlas (Phase 78's scope), which still draws its 12px
 * HUD glyphs on this same coarse grid. Phase 78 is expected to delete this
 * constant, drawPixelSprite, and the PixelSprite/PixelPalette types once that
 * last generator is also migrated.
 */
const ANIMAL_PIXEL_GRID = 6;

type PixelPalette = Record<string, number>;

interface PixelSprite {
  /** Rows of palette-key characters, top to bottom. '.' means transparent. */
  pattern: string[];
  palette: PixelPalette;
}

/**
 * Phase 73 (visual overhaul): the procedural Dirt/Gravel/Sand/Water/Rock
 * PixelSprite definitions that used to live here are gone. Terrain tiles are
 * now loaded from a real PNG (public/art/tiles-atlas.png, currently a
 * PLACEHOLDER pending real AI-generated art - see
 * docs/phase_73_to_78_visual_overhaul_plan.md and public/art/README.md) via
 * `this.load.image(TILESET_KEY, ...)` in `preload()`. The TileType enum order
 * (Dirt=0, Gravel=1, Sand=2, Water=3, Rock=4) that used to govern
 * TILE_SPRITES' array order now instead governs the PNG's 5 left-to-right
 * frame order - see `mapConfig.ts`'s TileType enum, which is the actual
 * source of truth both before and after this change.
 */

/**
 * Phase 77 (visual overhaul): the procedural Tree/Cactus PixelSprite
 * definitions that used to live here are gone. Vegetation is now loaded from
 * a real PNG+JSON atlas (public/art/vegetation-atlas.png/.json, currently a
 * PLACEHOLDER pending real AI-generated art - see
 * docs/phase_73_to_78_visual_overhaul_plan.md and public/art/README.md) via
 * `this.load.atlas(VEGETATION_ATLAS_KEY, ...)` in `preload()`.
 */

/**
 * Phase 33 resource icons: drawn on the coarse 6x6 small-sprite grid and
 * scaled to RESOURCE_ICON_SIZE. Each is a single readable silhouette rather
 * than a detailed illustration - at 12px in a HUD grid, shape and colour are
 * the only signal that survives.
 */
const RESOURCE_ICON_SPRITES: Record<ResourceKey, PixelSprite> = {
  rawMeat: {
    palette: { M: 0xd05a6e, B: 0xf2e6d8 },
    pattern: ['..MM..', '.MMMM.', 'MMMMMM', 'MMMMMM', '.MMMM.', '..BB..'],
  },
  meat: {
    palette: { M: 0x8d3b2f, F: 0xd08a7a, B: 0xf2e6d8 },
    pattern: ['..MM..', '.MFFM.', 'MFMMFM', 'MFMMFM', '.MFFM.', '..BB..'],
  },
  water: {
    palette: { W: 0x2f7fbf, H: 0x6ec6ff },
    pattern: ['..WW..', '..WW..', '.WHWW.', 'WHWWWW', 'WWWWWW', '.WWWW.'],
  },
  eggs: {
    palette: { E: 0xfff8e1, S: 0xd7c9a8 },
    pattern: ['..EE..', '.EEEE.', 'EEEEES', 'EEEEES', '.EEEES', '..SS..'],
  },
  leather: {
    palette: { L: 0x9c6b3f, D: 0x6d4c41 },
    pattern: ['D....D', '.LLLL.', 'LLLLLL', 'LLLLLL', '.LLLL.', 'D....D'],
  },
  clothes: {
    palette: { C: 0x5c6bc0, T: 0x3949ab },
    pattern: ['TC..CT', 'CCCCCC', 'CCCCCC', '.CCCC.', '.CCCC.', '.T..T.'],
  },
  logs: {
    palette: { K: 0x8d6748, E: 0xd7ccc8 },
    pattern: ['......', 'EKKKKE', 'EKKKKE', 'EKKKKE', 'EKKKKE', '......'],
  },
  wood: {
    palette: { P: 0xc9a063, D: 0x9c7b52 },
    pattern: ['PPPPPP', 'DDDDDD', 'PPPPPP', 'DDDDDD', 'PPPPPP', '......'],
  },
  potatoes: {
    palette: { P: 0xc9a063, S: 0x8d6748 },
    pattern: ['.PPPP.', 'PPSPPP', 'PPPPSP', 'PSPPPP', 'PPPPSP', '.PPPP.'],
  },
  liquor: {
    palette: { G: 0x8d6e4a, L: 0xd2823a, C: 0xd7ccc8 },
    pattern: ['..CC..', '..GG..', '.GLLG.', 'GLLLLG', 'GLLLLG', 'GGGGGG'],
  },
  agaveJuice: {
    palette: { G: 0x7cb342, J: 0xaed581, C: 0xd7ccc8 },
    pattern: ['..CC..', '..GG..', '.GJJG.', 'GJJJJG', 'GJJJJG', 'GGGGGG'],
  },
  // Phase 50: Stone/Iron -> Blacksmith Tools Chain icons.
  stone: {
    palette: { R: 0x9e9e9e, D: 0x616161 },
    pattern: ['.RRRR.', 'RRDRRR', 'RRRRDR', 'RDRRRR', 'RRRDRR', '.RRRR.'],
  },
  iron: {
    palette: { O: 0xbf360c, D: 0x3e2723 },
    pattern: ['.OOOO.', 'ODOOOO', 'OOOODO', 'ODOOOO', 'OOOODO', '.OOOO.'],
  },
  tools: {
    // A small hammer silhouette: grey head (H) over a brown handle (W).
    palette: { H: 0x616161, W: 0x8d6e4a },
    pattern: ['..HH..', '..HH..', '.HHHH.', '..WW..', '..WW..', '..WW..'],
  },
  // Phase 67: black/dark-grey coal-chunk icon, mirroring stone/iron's shape.
  coal: {
    palette: { K: 0x212121, H: 0x424242 },
    pattern: ['.KKKK.', 'KKHKKK', 'KKKKHK', 'KHKKKK', 'KKKHKK', '.KKKK.'],
  },
};

/**
 * Phase 75 (visual overhaul): the procedural Chicken/Pig/Cow/Ostrich
 * PixelSprite definitions that used to live here are gone. Animal critters
 * are now loaded from a real PNG+JSON atlas (public/art/animals-atlas.png/
 * .json, currently a PLACEHOLDER pending real AI-generated art - see
 * docs/phase_73_to_78_visual_overhaul_plan.md and public/art/README.md) via
 * `this.load.atlas(ANIMALS_ATLAS_KEY, ...)` in `preload()`.
 */

/**
 * Phase 77 (visual overhaul): the procedural WellCrank/WarehouseDoor/
 * SupermarketAwning/ChickenDoor/HouseWindowLight/Campfire accent PixelSprite
 * definitions that used to live here are gone. These 6 accent sprites are now
 * loaded from a real PNG+JSON atlas (public/art/accents-atlas.png/.json,
 * currently a PLACEHOLDER pending real AI-generated art - see
 * docs/phase_73_to_78_visual_overhaul_plan.md and public/art/README.md) via
 * `this.load.atlas(ACCENTS_ATLAS_KEY, ...)` in `preload()`. Every accent's
 * exact frame size, origin, pivot and tween in MainScene.ts is unchanged by
 * this phase - only the atlas's load mechanism (procedural -> real file)
 * changed.
 */

/**
 * Phase 75 (visual overhaul): the procedural Villager/Cowboy/Cowboy-on-Horse/
 * Brawler/Dynamiter PixelSprite definitions that used to live here are gone.
 * These 5 small-unit sprites are now loaded from real PNG+JSON atlases
 * (public/art/villagers-atlas.png/.json, cowboys-atlas.png/.json,
 * mounted-cowboys-atlas.png/.json, brawlers-atlas.png/.json,
 * dynamiters-atlas.png/.json - all currently PLACEHOLDERS pending real
 * AI-generated art, see docs/phase_73_to_78_visual_overhaul_plan.md and
 * public/art/README.md) via `this.load.atlas(...)` in `preload()`.
 */

/**
 * Phase 77 (visual overhaul): the procedural Goods Cart PixelSprite
 * definition that used to live here is gone. It is now loaded from a real
 * PNG+JSON atlas (public/art/carts-atlas.png/.json, currently a PLACEHOLDER
 * pending real AI-generated art - see
 * docs/phase_73_to_78_visual_overhaul_plan.md and public/art/README.md) via
 * `this.load.atlas(CARTS_ATLAS_KEY, ...)` in `preload()`.
 */

/**
 * Phase 76 (visual overhaul): the procedural Outlaw/Rustler/Coyote raider,
 * Snake/Coyote/MountainLion wildlife, and per-faction Raider Camp PixelSprite
 * definitions that used to live here are gone. These 3 hostile-unit sprite
 * sets are now loaded from real PNG+JSON atlases (public/art/raiders-atlas.png/
 * .json, public/art/wildlife-atlas.png/.json, public/art/raider-camps-atlas.png/
 * .json - all currently PLACEHOLDERS pending real AI-generated art, see
 * docs/phase_73_to_78_visual_overhaul_plan.md and public/art/README.md) via
 * `this.load.atlas(...)` in `preload()`. Note the old wildlife Coyote pattern
 * literally reused the raider Coyote pattern object
 * (`WILDLIFE_SPRITES.Coyote = COYOTE_SPRITE`); the two are now genuinely
 * separate, distinguishable placeholder frames (raider-Coyotes gets a bandana
 * marker the ambient wildlife-Coyote does not) per the plan's §5f resolution.
 */

function drawPixelSprite(
  graphics: Phaser.GameObjects.Graphics,
  originX: number,
  originY: number,
  sprite: PixelSprite,
  pixelSize: number = PIXEL_SIZE,
): void {
  sprite.pattern.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col++) {
      const key = row[col];
      if (key === '.') {
        continue;
      }
      graphics.fillStyle(sprite.palette[key], 1);
      graphics.fillRect(originX + col * pixelSize, originY + rowIndex * pixelSize, pixelSize, pixelSize);
    }
  });
}

export class BootScene extends Phaser.Scene {
  /** Phase 73: loading-progress visuals, created in preload(), torn down at the start of create(). */
  private loadingBarGraphics: Phaser.GameObjects.Graphics | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.createLoadingBar();

    // Phase 73 (visual overhaul, pipeline foundation): terrain tiles are the
    // first real network-loaded asset the game has ever had. Buildings
    // (below) became the second in Phase 74; every remaining category stays
    // 100% procedural (generateResourceIconAtlas, Phase 78) until its own
    // phase replaces it - see docs/phase_73_to_78_visual_overhaul_plan.md.
    //
    // TILESET_KEY is load-bearing (MainScene's `map.addTilesetImage('tiles',
    // TILESET_KEY, TILE_SIZE, TILE_SIZE, 0, 0)` call). A plain `load.image`
    // is sufficient (not `load.spritesheet`): Phaser's Tileset computes its 5
    // per-tile texture-coordinate rects directly from the raw source image's
    // pixel dimensions and the tileWidth/tileHeight passed to
    // addTilesetImage (Tileset.updateTileData), independent of Phaser's own
    // named-frame system - exactly how the old procedural
    // `graphics.generateTexture(TILESET_KEY, ...)` (which also produced a
    // single default frame) already worked, so this is a zero-behavior-change
    // swap of "generate a canvas texture" for "load a PNG into that key".
    // See public/art/README.md: the shipped tiles-atlas.png is currently a
    // PLACEHOLDER, not final art.
    this.load.image(TILESET_KEY, 'art/tiles-atlas.png');

    // Phase 74 (visual overhaul, buildings): the 34-building + 3-variant
    // atlas is now a real loaded PNG+JSON pair rather than a runtime-
    // generated canvas texture. `this.load.atlas()` populates BUILDING_ATLAS_KEY
    // with every frame name buildings-atlas.json declares - as long as those
    // names exactly match what buildingTextureKey() produces (verified by
    // `node tools/verify-building-frames.mjs`), every consuming call site
    // (MainScene's placement preview, createVisualForBuilding, the House
    // tier swap, the WoodenGate open/closed swap) needs zero changes. See
    // public/art/README.md: buildings-atlas.png is currently a PLACEHOLDER,
    // not final art.
    this.load.atlas(BUILDING_ATLAS_KEY, 'art/buildings-atlas.png', 'art/buildings-atlas.json');

    // Phase 75 (visual overhaul, player units/villagers/animals): these 6
    // atlases are now real loaded PNG+JSON pairs rather than runtime-
    // generated canvas textures, exactly mirroring Phase 74's building-atlas
    // swap above - frame names/sizes are the contract (verified by
    // `node tools/verify-unit-frames.mjs`), so every consuming call site in
    // MainScene.ts (spawnUnitOfKind, redrawAnimalSprites, villager spawning)
    // needs zero changes. See public/art/README.md: all 6 files are currently
    // PLACEHOLDERS, not final art.
    this.load.atlas(ANIMALS_ATLAS_KEY, 'art/animals-atlas.png', 'art/animals-atlas.json');
    this.load.atlas(COWBOYS_ATLAS_KEY, 'art/cowboys-atlas.png', 'art/cowboys-atlas.json');
    this.load.atlas(
      MOUNTED_COWBOYS_ATLAS_KEY,
      'art/mounted-cowboys-atlas.png',
      'art/mounted-cowboys-atlas.json',
    );
    this.load.atlas(BRAWLERS_ATLAS_KEY, 'art/brawlers-atlas.png', 'art/brawlers-atlas.json');
    this.load.atlas(DYNAMITERS_ATLAS_KEY, 'art/dynamiters-atlas.png', 'art/dynamiters-atlas.json');
    this.load.atlas(VILLAGERS_ATLAS_KEY, 'art/villagers-atlas.png', 'art/villagers-atlas.json');

    // Phase 76 (visual overhaul, raiders/raider camps/wildlife): these 3
    // atlases are now real loaded PNG+JSON pairs rather than runtime-
    // generated canvas textures, mirroring Phase 75's unit-atlas swap above -
    // frame names/sizes are the contract (verified by
    // `node tools/verify-raider-frames.mjs`), so every consuming call site in
    // MainScene.ts (spawnRaider, spawnWildlifeCreature, spawnInitialRaiderCamps)
    // needs zero changes. Raiders/wildlife load at 18x18 (WILDLIFE_SPRITE_SIZE
    // raised 12->18 this phase to match Phase 75's player-unit size); raider
    // camps stay 24x24 (RAIDER_CAMP_SPRITE_SIZE, an independent literal this
    // phase does not touch). See public/art/README.md: all 3 files are
    // currently PLACEHOLDERS, not final art.
    this.load.atlas(RAIDERS_ATLAS_KEY, 'art/raiders-atlas.png', 'art/raiders-atlas.json');
    this.load.atlas(
      RAIDER_CAMPS_ATLAS_KEY,
      'art/raider-camps-atlas.png',
      'art/raider-camps-atlas.json',
    );
    this.load.atlas(WILDLIFE_ATLAS_KEY, 'art/wildlife-atlas.png', 'art/wildlife-atlas.json');

    // Phase 77 (visual overhaul, vegetation/carts/accents): these 3 atlases
    // are now real loaded PNG+JSON pairs rather than runtime-generated canvas
    // textures, mirroring Phase 76's raider-atlas swap above - frame names/
    // sizes are the contract (verified by `node tools/verify-world-frames.mjs`),
    // so every consuming call site in MainScene.ts (addVegetationSprite,
    // spawnGoodsCart, createAccentImage and its 6 per-accent wrappers) needs
    // zero changes. Vegetation stays tile-sized (32x32, unaffected by Phase
    // 75's 12->18 small-unit bump); the cart frame stays its own independent
    // 14x10 non-square size; every accent keeps its exact pre-existing frame
    // size (16x4 WellCrank, 24x24 WarehouseDoor, 64x8 SupermarketAwning, 16x12
    // ChickenDoor, 12x12 HouseWindowLight, 12x12 Campfire). See
    // public/art/README.md: all 3 files are currently PLACEHOLDERS, not final
    // art.
    this.load.atlas(VEGETATION_ATLAS_KEY, 'art/vegetation-atlas.png', 'art/vegetation-atlas.json');
    this.load.atlas(CARTS_ATLAS_KEY, 'art/carts-atlas.png', 'art/carts-atlas.json');
    this.load.atlas(ACCENTS_ATLAS_KEY, 'art/accents-atlas.png', 'art/accents-atlas.json');

    // Still 100% procedural (Phase 78 hasn't landed yet) - see
    // docs/phase_73_to_78_visual_overhaul_plan.md. generateResourceIconAtlas
    // is the LAST procedural generator remaining in this file.
    this.generateResourceIconAtlas();
  }

  create(): void {
    this.destroyLoadingBar();
    this.publishBuildingIcons();
    this.scene.start('MainScene');
  }

  /**
   * Phase 73: minimal loading-progress bar. Boot used to be instant (zero
   * loaded assets); tiles-atlas.png is now a real `this.load.image()` network
   * fetch, so a (likely very brief) gap is now possible where previously
   * there was none. `this.load.on('progress', ...)` fires with a 0-1 fraction
   * as each queued file completes.
   */
  private createLoadingBar(): void {
    const barWidth = 320;
    const barHeight = 24;
    const x = this.cameras.main.width / 2 - barWidth / 2;
    const y = this.cameras.main.height / 2 - barHeight / 2;

    const graphics = this.add.graphics();
    graphics.fillStyle(0x3e2723, 1);
    graphics.fillRect(x - 4, y - 4, barWidth + 8, barHeight + 8);
    graphics.fillStyle(0x1c1c1c, 1);
    graphics.fillRect(x, y, barWidth, barHeight);
    this.loadingBarGraphics = graphics;

    this.loadingText = this.add
      .text(this.cameras.main.width / 2, y - 20, 'Loading...', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#efebe9',
      })
      .setOrigin(0.5, 1);

    this.load.on('progress', (fraction: number) => {
      graphics.fillStyle(0x1c1c1c, 1);
      graphics.fillRect(x, y, barWidth, barHeight);
      graphics.fillStyle(0xffd54f, 1);
      graphics.fillRect(x, y, barWidth * fraction, barHeight);
    });
  }

  private destroyLoadingBar(): void {
    this.loadingBarGraphics?.destroy();
    this.loadingBarGraphics = null;
    this.loadingText?.destroy();
    this.loadingText = null;
  }

  /**
   * Rasterises each building frame out of the generated atlas into a data URL
   * for the DOM building bar (Phase 33). Wrapped in a try/catch because this
   * is a purely cosmetic enhancement: if the canvas read ever fails (e.g. a
   * renderer that doesn't back the texture with a readable canvas), the bar
   * falls back to its text labels rather than taking the game down with it.
   */
  private publishBuildingIcons(): void {
    try {
      const texture = this.textures.get(BUILDING_ATLAS_KEY);
      const source = texture.getSourceImage();
      if (!(source instanceof HTMLCanvasElement) && !(source instanceof HTMLImageElement)) {
        return;
      }

      const icons: Partial<Record<BuildingType, string>> = {};
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      for (const definition of Object.values(BUILDING_DEFINITIONS)) {
        const frame = texture.get(buildingTextureKey(definition.type));
        canvas.width = frame.width;
        canvas.height = frame.height;
        context.clearRect(0, 0, frame.width, frame.height);
        context.drawImage(source, frame.cutX, frame.cutY, frame.width, frame.height, 0, 0, frame.width, frame.height);
        icons[definition.type] = canvas.toDataURL();
      }

      setBuildingIcons(icons);
    } catch {
      // Icons stay empty; BuildingBar renders its text-label fallback.
    }
  }

  /** One frame per ResourceKey, uniform grid at RESOURCE_ICON_SIZE; drawn on the coarse small-sprite pixel grid. */
  private generateResourceIconAtlas(): void {
    const keys = Object.keys(RESOURCE_ICON_SPRITES) as ResourceKey[];
    const iconPixelSize = RESOURCE_ICON_SIZE / ANIMAL_PIXEL_GRID;

    const graphics = this.make.graphics({ x: 0, y: 0 });
    keys.forEach((key, index) => {
      drawPixelSprite(graphics, index * RESOURCE_ICON_SIZE, 0, RESOURCE_ICON_SPRITES[key], iconPixelSize);
    });

    graphics.generateTexture(RESOURCE_ICONS_ATLAS_KEY, keys.length * RESOURCE_ICON_SIZE, RESOURCE_ICON_SIZE);
    graphics.destroy();

    const texture = this.textures.get(RESOURCE_ICONS_ATLAS_KEY);
    keys.forEach((key, index) => {
      texture.add(resourceIconTextureKey(key), 0, index * RESOURCE_ICON_SIZE, 0, RESOURCE_ICON_SIZE, RESOURCE_ICON_SIZE);
    });
  }

  /**
   * Phase 76 (visual overhaul): generateRaiderAtlas / generateWildlifeAtlas /
   * generateRaiderCampAtlas used to live here (procedural canvas-texture
   * generators for RAIDERS_ATLAS_KEY / WILDLIFE_ATLAS_KEY /
   * RAIDER_CAMPS_ATLAS_KEY). All three are now real loaded PNG+JSON atlases
   * (see preload()) - see public/art/README.md for the current PLACEHOLDER
   * status of each.
   *
   * Phase 77 (visual overhaul): generateVegetationAtlas / generateCartAtlas /
   * generateAccentAtlas also used to live here (procedural canvas-texture
   * generators for VEGETATION_ATLAS_KEY / CARTS_ATLAS_KEY / ACCENTS_ATLAS_KEY).
   * All three are now real loaded PNG+JSON atlases (see preload()) - see
   * public/art/README.md for the current PLACEHOLDER status of each. This was
   * the last "world art" category to migrate: generateResourceIconAtlas
   * (above) is now the only procedural generator left in this file, reserved
   * for Phase 78, which is also expected to be the phase that finally deletes
   * drawPixelSprite/PixelSprite/PixelPalette/ANIMAL_PIXEL_GRID once that last
   * generator is migrated too.
   */
}
