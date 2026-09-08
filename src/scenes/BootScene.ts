import Phaser from 'phaser';
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
  VILLAGERS_ATLAS_KEY,
  buildingTextureKey,
} from '../config/buildingConfig';
import { VEGETATION_ATLAS_KEY } from '../config/vegetationConfig';
import { WILDLIFE_ATLAS_KEY } from '../config/wildlifeConfig';
import { setBuildingIcons } from '../ui/buildingIcons';

export const TILESET_KEY = 'tiles-atlas';

/**
 * Phase 73-78 (visual overhaul): every asset this scene loads used to be a
 * runtime-procedural Graphics-drawn texture (drawPixelSprite / PixelSprite /
 * PixelPalette / the various *_SPRITE pattern tables and generate*Atlas
 * methods). Phase 78 deleted the last of those (generateResourceIconAtlas)
 * and its shared drawing primitives - every texture below is now a real
 * loaded PNG(+JSON atlas) file under public/art/, all still PLACEHOLDER art
 * (see public/art/README.md and docs/phase_73_to_78_visual_overhaul_plan.md).
 * Frame names are produced by pure functions in buildingConfig.ts /
 * vegetationConfig.ts / wildlifeConfig.ts (buildingTextureKey,
 * resourceIconTextureKey, etc.) - as long as each atlas JSON uses exactly
 * those strings as its frame names, no code outside this preload() needed to
 * change when a category migrated from procedural to loaded.
 */
export class BootScene extends Phaser.Scene {
  /** Phase 73: loading-progress visuals, created in preload(), torn down at the start of create(). */
  private loadingBarGraphics: Phaser.GameObjects.Graphics | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.createLoadingBar();

    // TILESET_KEY is load-bearing (MainScene's `map.addTilesetImage('tiles',
    // TILESET_KEY, TILE_SIZE, TILE_SIZE, 0, 0)` call). A plain `load.image` is
    // sufficient (not `load.spritesheet`): Phaser's Tileset computes its 5
    // per-tile texture-coordinate rects directly from the raw source image's
    // pixel dimensions and the tileWidth/tileHeight passed to
    // addTilesetImage, independent of Phaser's own named-frame system.
    this.load.image(TILESET_KEY, 'art/tiles-atlas.png');

    // Buildings: 34-building + 3-variant atlas (House tier2/tier3, WoodenGate
    // closed). Frame names must exactly match buildingTextureKey() - verified
    // by `node tools/verify-building-frames.mjs`.
    this.load.atlas(BUILDING_ATLAS_KEY, 'art/buildings-atlas.png', 'art/buildings-atlas.json');

    // Player units, villagers, animals - verified by `node tools/verify-unit-frames.mjs`.
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

    // Raiders, raider camps, wildlife - verified by `node tools/verify-raider-frames.mjs`.
    this.load.atlas(RAIDERS_ATLAS_KEY, 'art/raiders-atlas.png', 'art/raiders-atlas.json');
    this.load.atlas(
      RAIDER_CAMPS_ATLAS_KEY,
      'art/raider-camps-atlas.png',
      'art/raider-camps-atlas.json',
    );
    this.load.atlas(WILDLIFE_ATLAS_KEY, 'art/wildlife-atlas.png', 'art/wildlife-atlas.json');

    // Vegetation, carts, accents - verified by `node tools/verify-world-frames.mjs`.
    this.load.atlas(VEGETATION_ATLAS_KEY, 'art/vegetation-atlas.png', 'art/vegetation-atlas.json');
    this.load.atlas(CARTS_ATLAS_KEY, 'art/carts-atlas.png', 'art/carts-atlas.json');
    this.load.atlas(ACCENTS_ATLAS_KEY, 'art/accents-atlas.png', 'art/accents-atlas.json');

    // Resource icons (HUD chrome) - the last category migrated (Phase 78),
    // verified by `node tools/verify-resource-icon-frames.mjs`.
    this.load.atlas(
      RESOURCE_ICONS_ATLAS_KEY,
      'art/resource-icons-atlas.png',
      'art/resource-icons-atlas.json',
    );
  }

  create(): void {
    this.destroyLoadingBar();
    this.publishBuildingIcons();
    this.scene.start('MainScene');
  }

  /**
   * Phase 73: minimal loading-progress bar. Boot used to be instant (zero
   * loaded assets); every atlas above is now a real network fetch, so a
   * (likely very brief) gap is now possible where previously there was none.
   * `this.load.on('progress', ...)` fires with a 0-1 fraction as each queued
   * file completes.
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
   * Rasterises each building frame out of the loaded atlas into a data URL
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
}
