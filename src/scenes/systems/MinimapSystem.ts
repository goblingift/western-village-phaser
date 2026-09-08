import Phaser from 'phaser';
import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MINIMAP_HEIGHT,
  MINIMAP_MARGIN,
  MINIMAP_WIDTH,
  TILE_SIZE,
} from '../../config/constants';
import { TILE_COLORS, TileType } from '../../config/mapConfig';
import { VEGETATION_DEFINITIONS } from '../../config/vegetationConfig';
import { getVegetation } from '../../state/vegetation';
import { BUILDING_DEFINITIONS, PlacedBuilding } from '../../config/buildingConfig';
import { gameEvents } from '../../state/gameEvents';
import { getPlacedBuildings } from '../../state/gameState';
import { getRaiderCamps } from '../../state/raiderCamps';
import type { MainScene } from '../MainScene';

const MINIMAP_VEGETATION_DOT_SIZE = 2;
const MINIMAP_BORDER_COLOR = 0xffffff;
const MINIMAP_VIEWPORT_COLOR = 0xffee58;
const MINIMAP_VIEWPORT_THROTTLE_MS = 50;
const MINIMAP_BUILDING_DOT_SIZE = 3;

/**
 * Phase 45: minimap combat awareness. Live unit/raider dots and building
 * damage-flash/off-screen pings are redrawn on their own Graphics object
 * (minimapCombatGraphics) at the exact same throttle interval the viewport
 * rectangle already uses (MINIMAP_VIEWPORT_THROTTLE_MS), but driven from
 * update() every frame rather than only on camera-move/pointer events -
 * units and raiders drift continuously even while the camera sits still.
 */
const MINIMAP_UNIT_DOT_SIZE = 3;
const MINIMAP_UNIT_COLOR = 0x2979ff;
const MINIMAP_RAIDER_DOT_SIZE = 3;
const MINIMAP_RAIDER_COLOR = 0xff1744;
/** Phase 71: Hostile Wildlife gets its own distinct minimap dot color - orange, distinct from the raider red/unit blue/camp purple - drawn on the same throttled minimapCombatGraphics layer raiders/units share, since a creature roams continuously. */
const MINIMAP_WILDLIFE_DOT_SIZE = 3;
const MINIMAP_WILDLIFE_COLOR = 0xff9100;
/**
 * Phase 57: Raider Camps get their own distinct minimap marker color/size -
 * bigger than a unit dot and drawn on the always-on minimapGraphics (not the
 * throttled minimapCombatGraphics units/raiders share), since a camp is a
 * permanent map feature the player should be able to plan around at any
 * time, not just during an active wave.
 */
const MINIMAP_CAMP_DOT_SIZE = 5;
const MINIMAP_CAMP_COLOR = 0x9c27b0;
/** How long a hit building's minimap dot alternates size/color after taking damage. */
const MINIMAP_FLASH_DURATION_MS = 1600;
/** Blink half-period - the flash dot toggles size every this-many ms. */
const MINIMAP_FLASH_BLINK_MS = 200;
const MINIMAP_FLASH_COLOR = 0xffffff;
const MINIMAP_FLASH_DOT_SIZE = MINIMAP_BUILDING_DOT_SIZE + 3;
/** Off-screen attack ping: how long after the last hit it keeps fading before disappearing. */
const OFFSCREEN_PING_FADE_MS = 3000;
const OFFSCREEN_PING_PULSE_MS = 500;
const OFFSCREEN_PING_COLOR = 0xff6d00;
const OFFSCREEN_PING_RADIUS = 4;
/** Keeps the ping's edge-clamped point from ever touching the minimap's own border stroke. */
const OFFSCREEN_PING_EDGE_INSET = 5;

/** Phase 45: a snapshot of where/until a building's minimap dot should flash after taking raid damage, kept independent of the building still existing so a killing blow's flash can outlive removeDestroyedBuildings() dropping the record. */
interface MinimapBuildingFlash {
  tileX: number;
  tileY: number;
  until: number;
}

/** Phase 45: an off-screen building currently under attack, tracked so the minimap can point toward it until a few seconds pass without another hit. */
interface OffscreenThreat {
  worldX: number;
  worldY: number;
  lastHitAt: number;
}

/**
 * Phase 87: MainScene Decomposition Part 3 - Minimap.
 *
 * A pure code-move out of MainScene.ts: minimap terrain/building-dot
 * rendering, the throttled camera-viewport rectangle, throttled combat-dot
 * rendering (units/raiders/wildlife), building-damage flash pings,
 * off-screen-threat pings, and minimap click/drag-to-navigate hit-testing.
 * Follows RaidSystem.ts/WorldVisualsSystem.ts/AmbientLifeSystem.ts's exact
 * plain-class pattern - constructed once in MainScene.create() as
 * `new MinimapSystem(this)`.
 *
 * Cross-system dependency: redrawMinimapCombat reads RaidSystem's `raiders`
 * and AmbientLifeSystem's `wildlife`, and MainScene's own `cowboyUnits` -
 * reached via `this.scene.xxx` late-binding, matching every other system's
 * established convention rather than a constructor-injected reference.
 */
export class MinimapSystem {
  private scene: MainScene;

  private minimapX = 0;
  private minimapY = 0;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private minimapViewportGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 87: non-private - MainScene's setupCameraDrag/setupBuildingPlacement/etc. (now InputSystem) read this to distinguish a minimap click from a world one. */
  minimapPointerActive = false;
  private lastMinimapViewportRedraw = 0;
  /** Phase 45: live unit/raider dots + damage flashes/off-screen pings - separate from minimapGraphics since this one redraws continuously instead of only on placement events. */
  private minimapCombatGraphics!: Phaser.GameObjects.Graphics;
  private lastMinimapCombatRedraw = 0;
  /** Phase 87: non-private - RaidSystem.resolveRaiderAttacks()/resetRaidState() read/clear both wave-scoped maps via this.scene.minimapSystem. */
  minimapBuildingFlashes = new Map<string, MinimapBuildingFlash>();
  offscreenThreats = new Map<string, OffscreenThreat>();

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  setup(): void {
    this.minimapX = MINIMAP_MARGIN;
    this.minimapY = this.scene.resourceHud.getBottomY() + MINIMAP_MARGIN;

    this.minimapGraphics = this.scene.add.graphics();
    this.minimapGraphics.setScrollFactor(0);
    this.minimapGraphics.setDepth(1000);

    this.minimapViewportGraphics = this.scene.add.graphics();
    this.minimapViewportGraphics.setScrollFactor(0);
    this.minimapViewportGraphics.setDepth(1001);

    // Phase 45: above the viewport rectangle so live combat dots/pings are
    // never hidden behind it.
    this.minimapCombatGraphics = this.scene.add.graphics();
    this.minimapCombatGraphics.setScrollFactor(0);
    this.minimapCombatGraphics.setDepth(1002);

    // Phase 63: all three minimap layers are HUD, drawn in screen coordinates
    // (minimapX/minimapY + a tile-scaled offset). Their relative depths
    // 1000/1001/1002 still order them against each other inside the UI
    // camera's own render list exactly as before.
    this.scene.registerUiObject(
      this.minimapGraphics,
      this.minimapViewportGraphics,
      this.minimapCombatGraphics,
    );

    this.redrawMinimap();

    gameEvents.on('building-placed', () => this.redrawMinimap());
    gameEvents.on('game-reset', () => this.redrawMinimap());

    // Phase 82: viewport culling for newly created sprites is deliberately
    // NOT wired as a 'building-placed'/'game-loaded'/'game-reset' listener
    // here. gameState.placeBuilding emits 'building-placed' BEFORE
    // placeBuildingAt calls createVisualForBuilding (see that method's own
    // "connections-updated already fired before this building's visual
    // existed" comment for the identical, pre-existing ordering quirk), and
    // Phaser fires listeners in registration order, so this method
    // (setup, called early in create()) would in any case run before
    // setupSaveLoad/setupGameReset's own rebuild listeners. Instead,
    // updateViewportCulling() is called directly, right after the relevant
    // sprites actually exist, from placeBuildingAt, setupSaveLoad's
    // 'game-loaded' handler, and setupGameReset's 'game-reset' handler.
  }

  redrawMinimap(): void {
    this.minimapGraphics.clear();

    const tileWidth = MINIMAP_WIDTH / MAP_WIDTH_TILES;
    const tileHeight = MINIMAP_HEIGHT / MAP_HEIGHT_TILES;

    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const tileType = this.scene.tileData[y]?.[x] ?? TileType.Dirt;
        this.minimapGraphics.fillStyle(TILE_COLORS[tileType], 1);
        this.minimapGraphics.fillRect(
          this.minimapX + x * tileWidth,
          this.minimapY + y * tileHeight,
          tileWidth,
          tileHeight,
        );
      }
    }

    // Phase 30: vegetation is drawn under the building dots - it's terrain-
    // scale context (where the woods and cactus fields are, i.e. where a
    // Forestry or Cactus Milker would pay off), not a town landmark.
    for (const entity of getVegetation()) {
      this.minimapGraphics.fillStyle(VEGETATION_DEFINITIONS[entity.kind].color, 1);
      this.minimapGraphics.fillRect(
        this.minimapX + entity.tileX * tileWidth,
        this.minimapY + entity.tileY * tileHeight,
        MINIMAP_VEGETATION_DOT_SIZE,
        MINIMAP_VEGETATION_DOT_SIZE,
      );
    }

    for (const building of getPlacedBuildings()) {
      const { width, height } = BUILDING_DEFINITIONS[building.type].size;
      const centerTileX = building.tileX + width / 2;
      const centerTileY = building.tileY + height / 2;
      this.minimapGraphics.fillStyle(BUILDING_DEFINITIONS[building.type].color, 1);
      this.minimapGraphics.fillRect(
        this.minimapX + centerTileX * tileWidth - MINIMAP_BUILDING_DOT_SIZE / 2,
        this.minimapY + centerTileY * tileHeight - MINIMAP_BUILDING_DOT_SIZE / 2,
        MINIMAP_BUILDING_DOT_SIZE,
        MINIMAP_BUILDING_DOT_SIZE,
      );
    }

    // Phase 57: Raider Camps are drawn on this always-on layer (redrawn on
    // building-placed/game-reset/camp-spawned/camp-destroyed), not the
    // throttled per-frame minimapCombatGraphics units/raiders share - a camp
    // never moves and should be visible as a standing objective regardless of
    // whether a wave is currently active.
    this.minimapGraphics.fillStyle(MINIMAP_CAMP_COLOR, 1);
    for (const camp of getRaiderCamps()) {
      const tileX = camp.x / TILE_SIZE;
      const tileY = camp.y / TILE_SIZE;
      this.minimapGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_CAMP_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_CAMP_DOT_SIZE / 2,
        MINIMAP_CAMP_DOT_SIZE,
        MINIMAP_CAMP_DOT_SIZE,
      );
    }

    this.minimapGraphics.lineStyle(1, MINIMAP_BORDER_COLOR, 0.8);
    this.minimapGraphics.strokeRect(this.minimapX, this.minimapY, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    this.redrawMinimapViewport();
  }

  redrawMinimapViewportThrottled(): void {
    const now = this.scene.time.now;
    if (now - this.lastMinimapViewportRedraw < MINIMAP_VIEWPORT_THROTTLE_MS) {
      return;
    }
    this.lastMinimapViewportRedraw = now;
    this.redrawMinimapViewport();
  }

  /** Phase 87: non-private - InputSystem's setupCameraZoom calls this directly (unthrottled) right after a zoom change, mirroring the original inline call. */
  redrawMinimapViewport(): void {
    this.minimapViewportGraphics.clear();

    const worldView = this.scene.cameras.main.worldView;
    const mapPixelWidth = MAP_WIDTH_TILES * TILE_SIZE;
    const mapPixelHeight = MAP_HEIGHT_TILES * TILE_SIZE;

    // worldView is zoom-aware, so this follows the camera's zoom for free
    // (Phase 33). Clamped to the minimap's own rect so a viewport wider than
    // the map (possible at the minimum zoom on non-default viewport sizes)
    // can never draw its rectangle outside the minimap frame.
    const rectX = this.minimapX + Phaser.Math.Clamp(worldView.x / mapPixelWidth, 0, 1) * MINIMAP_WIDTH;
    const rectY = this.minimapY + Phaser.Math.Clamp(worldView.y / mapPixelHeight, 0, 1) * MINIMAP_HEIGHT;
    const rectW = Math.min(
      (worldView.width / mapPixelWidth) * MINIMAP_WIDTH,
      this.minimapX + MINIMAP_WIDTH - rectX,
    );
    const rectH = Math.min(
      (worldView.height / mapPixelHeight) * MINIMAP_HEIGHT,
      this.minimapY + MINIMAP_HEIGHT - rectY,
    );

    this.minimapViewportGraphics.lineStyle(2, MINIMAP_VIEWPORT_COLOR, 1);
    this.minimapViewportGraphics.strokeRect(rectX, rectY, rectW, rectH);
  }

  /**
   * Phase 45: same throttle-and-redraw pair as redrawMinimapViewportThrottled/
   * redrawMinimapViewport, but called every update() frame instead of only on
   * camera-move/pointer events, since units and raiders keep moving on their
   * own.
   */
  redrawMinimapCombatThrottled(now: number): void {
    if (now - this.lastMinimapCombatRedraw < MINIMAP_VIEWPORT_THROTTLE_MS) {
      return;
    }
    this.lastMinimapCombatRedraw = now;
    this.redrawMinimapCombat(now);
  }

  private redrawMinimapCombat(now: number): void {
    this.minimapCombatGraphics.clear();

    const tileWidth = MINIMAP_WIDTH / MAP_WIDTH_TILES;
    const tileHeight = MINIMAP_HEIGHT / MAP_HEIGHT_TILES;

    this.redrawMinimapBuildingFlashes(now, tileWidth, tileHeight);

    this.minimapCombatGraphics.fillStyle(MINIMAP_UNIT_COLOR, 1);
    for (const unit of this.scene.cowboyUnits) {
      if (!this.scene.isCowboyUnitAlive(unit)) {
        continue;
      }
      const tileX = unit.image.x / TILE_SIZE;
      const tileY = unit.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_UNIT_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_UNIT_DOT_SIZE / 2,
        MINIMAP_UNIT_DOT_SIZE,
        MINIMAP_UNIT_DOT_SIZE,
      );
    }

    this.minimapCombatGraphics.fillStyle(MINIMAP_RAIDER_COLOR, 1);
    for (const raider of this.scene.raidSystem.raiders) {
      const tileX = raider.image.x / TILE_SIZE;
      const tileY = raider.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_RAIDER_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_RAIDER_DOT_SIZE / 2,
        MINIMAP_RAIDER_DOT_SIZE,
        MINIMAP_RAIDER_DOT_SIZE,
      );
    }

    this.minimapCombatGraphics.fillStyle(MINIMAP_WILDLIFE_COLOR, 1);
    for (const creature of this.scene.ambientLifeSystem.wildlife) {
      const tileX = creature.image.x / TILE_SIZE;
      const tileY = creature.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_WILDLIFE_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_WILDLIFE_DOT_SIZE / 2,
        MINIMAP_WILDLIFE_DOT_SIZE,
        MINIMAP_WILDLIFE_DOT_SIZE,
      );
    }

    this.redrawOffscreenThreatPings(now);
  }

  /** Prunes expired flashes, then draws the surviving ones alternating size on MINIMAP_FLASH_BLINK_MS. */
  private redrawMinimapBuildingFlashes(now: number, tileWidth: number, tileHeight: number): void {
    for (const [buildingId, flash] of this.minimapBuildingFlashes) {
      if (now >= flash.until) {
        this.minimapBuildingFlashes.delete(buildingId);
        continue;
      }

      const blinkOn = Math.floor((flash.until - now) / MINIMAP_FLASH_BLINK_MS) % 2 === 0;
      const size = blinkOn ? MINIMAP_FLASH_DOT_SIZE : MINIMAP_BUILDING_DOT_SIZE;
      this.minimapCombatGraphics.fillStyle(MINIMAP_FLASH_COLOR, 1);
      this.minimapCombatGraphics.fillRect(
        this.minimapX + flash.tileX * tileWidth - size / 2,
        this.minimapY + flash.tileY * tileHeight - size / 2,
        size,
        size,
      );
    }
  }

  /**
   * Phase 45: for every building currently under off-screen attack, draws a
   * pulsing dot at the point where a line from the minimap's centre to that
   * building's minimap position crosses the minimap's own border - a compact
   * "the threat is that way" indicator that fades out once
   * OFFSCREEN_PING_FADE_MS has passed since the last hit. Re-checks current
   * on-screen-ness every call (rather than trusting the off-screen snapshot
   * taken at hit time) so panning onto the fight clears its ping immediately.
   */
  private redrawOffscreenThreatPings(now: number): void {
    for (const [buildingId, threat] of this.offscreenThreats) {
      if (now - threat.lastHitAt > OFFSCREEN_PING_FADE_MS) {
        this.offscreenThreats.delete(buildingId);
        continue;
      }
      if (this.isWorldPointInViewport(threat.worldX, threat.worldY)) {
        continue;
      }

      const mapPixelWidth = MAP_WIDTH_TILES * TILE_SIZE;
      const mapPixelHeight = MAP_HEIGHT_TILES * TILE_SIZE;
      const targetX = this.minimapX + Phaser.Math.Clamp(threat.worldX / mapPixelWidth, 0, 1) * MINIMAP_WIDTH;
      const targetY = this.minimapY + Phaser.Math.Clamp(threat.worldY / mapPixelHeight, 0, 1) * MINIMAP_HEIGHT;

      const centerX = this.minimapX + MINIMAP_WIDTH / 2;
      const centerY = this.minimapY + MINIMAP_HEIGHT / 2;
      const dx = targetX - centerX;
      const dy = targetY - centerY;
      const halfW = MINIMAP_WIDTH / 2 - OFFSCREEN_PING_EDGE_INSET;
      const halfH = MINIMAP_HEIGHT / 2 - OFFSCREEN_PING_EDGE_INSET;
      const scale = Math.min(
        dx !== 0 ? Math.abs(halfW / dx) : Infinity,
        dy !== 0 ? Math.abs(halfH / dy) : Infinity,
        1,
      );
      const edgeX = centerX + dx * scale;
      const edgeY = centerY + dy * scale;

      const fadeAlpha = Phaser.Math.Clamp(1 - (now - threat.lastHitAt) / OFFSCREEN_PING_FADE_MS, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(now / OFFSCREEN_PING_PULSE_MS);
      this.minimapCombatGraphics.fillStyle(OFFSCREEN_PING_COLOR, fadeAlpha * (0.4 + 0.6 * pulse));
      this.minimapCombatGraphics.fillCircle(edgeX, edgeY, OFFSCREEN_PING_RADIUS);
    }
  }

  private isWorldPointInViewport(worldX: number, worldY: number): boolean {
    const view = this.scene.cameras.main.worldView;
    return worldX >= view.x && worldX <= view.right && worldY >= view.y && worldY <= view.bottom;
  }

  /**
   * Phase 45: called right after a raider damages a building (resolveRaiderAttacks)
   * so a hit anywhere on the map shows up on the minimap even if the player
   * is looking elsewhere. Snapshots the building's own centre tile rather
   * than holding a PlacedBuilding reference, so the flash still renders for
   * its full duration even if this same hit destroyed the building and
   * removeDestroyedBuildings() drops it from gameState a moment later.
   */
  registerMinimapBuildingDamage(building: PlacedBuilding): void {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const centerTileX = building.tileX + width / 2;
    const centerTileY = building.tileY + height / 2;
    const now = this.scene.time.now;

    this.minimapBuildingFlashes.set(building.id, {
      tileX: centerTileX,
      tileY: centerTileY,
      until: now + MINIMAP_FLASH_DURATION_MS,
    });

    const worldX = centerTileX * TILE_SIZE;
    const worldY = centerTileY * TILE_SIZE;
    if (this.isWorldPointInViewport(worldX, worldY)) {
      this.offscreenThreats.delete(building.id);
    } else {
      this.offscreenThreats.set(building.id, { worldX, worldY, lastHitAt: now });
    }
  }

  /** Phase 87: non-private - InputSystem's pointer handlers (camera drag, building placement/selection, demolish mode, unit control) all gate on this to distinguish a minimap click from a world one. */
  isPointerInMinimap(pointer: Phaser.Input.Pointer): boolean {
    return (
      pointer.x >= this.minimapX &&
      pointer.x <= this.minimapX + MINIMAP_WIDTH &&
      pointer.y >= this.minimapY &&
      pointer.y <= this.minimapY + MINIMAP_HEIGHT
    );
  }

  /** Phase 87: non-private - InputSystem's setupCameraDrag pointermove/pointerdown handlers call this while a minimap drag/click is in progress. */
  navigateMinimapTo(pointer: Phaser.Input.Pointer): void {
    const relX = Phaser.Math.Clamp(pointer.x - this.minimapX, 0, MINIMAP_WIDTH);
    const relY = Phaser.Math.Clamp(pointer.y - this.minimapY, 0, MINIMAP_HEIGHT);
    const worldX = (relX / MINIMAP_WIDTH) * MAP_WIDTH_TILES * TILE_SIZE;
    const worldY = (relY / MINIMAP_HEIGHT) * MAP_HEIGHT_TILES * TILE_SIZE;
    // Camera bounds set in buildTilemap() clamp the scroll automatically.
    this.scene.cameras.main.centerOn(worldX, worldY);
    this.redrawMinimapViewportThrottled();
  }
}
