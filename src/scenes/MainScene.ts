import Phaser from 'phaser';
import {
  COWBOY_DAMAGE,
  COWBOY_RANGE_TILES,
  GAME_DURATION_SECONDS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MINIMAP_HEIGHT,
  MINIMAP_MARGIN,
  MINIMAP_WIDTH,
  MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC,
  POPULATION_PER_HOUSE,
  PRODUCTION_TICK_MS,
  RAID_MAX_INTERVAL_MS,
  RAID_MAX_UNITS,
  RAID_MIN_INTERVAL_MS,
  RAID_MIN_UNITS,
  RAID_WAVE_TIMEOUT_MS,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../config/constants';
import { generateTileMap, TILE_COLORS, TileType } from '../config/mapConfig';
import { TILESET_KEY } from './BootScene';
import {
  ACCENTS_ATLAS_KEY,
  AccentKind,
  ANIMALS_ATLAS_KEY,
  ANIMAL_SPRITE_SIZE,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingType,
  COWBOYS_ATLAS_KEY,
  COWBOY_SPRITE_SIZE,
  COWBOY_TEXTURE_KEY,
  MOUNTED_COWBOYS_ATLAS_KEY,
  MOUNTED_COWBOY_SPRITE_HEIGHT,
  MOUNTED_COWBOY_SPRITE_WIDTH,
  MOUNTED_COWBOY_TEXTURE_KEY,
  PlacedBuilding,
  RAIDERS_ATLAS_KEY,
  RAIDER_DEFINITIONS,
  RaiderDefinition,
  RaiderFaction,
  VILLAGERS_ATLAS_KEY,
  VILLAGER_TEXTURE_KEY,
  accentTextureKey,
  animalTextureKey,
  buildingTextureKey,
  raiderTextureKey,
} from '../config/buildingConfig';
import { playPlacementSound } from '../audio/sound';
import { gameEvents } from '../state/gameEvents';
import {
  canPlaceBuilding,
  getBuildingAtTile,
  getBuildingById,
  getEmployedPopulation,
  getFenceLinks,
  getMoney,
  getPlacedBuildings,
  getResources,
  getStorageCap,
  getTotalBankBalance,
  getTotalMeatProduced,
  getTotalPopulation,
  placeBuilding,
  runProductionTick,
  tickTimer,
} from '../state/gameState';

const FENCE_LINE_COLOR = 0x8d6748;

/**
 * Phase 29: once every placed Bank's combined balance reaches this, raids
 * lean Outlaw and come faster - see pickRaidFaction/scheduleNextRaidCheck.
 * Below it, both behave exactly as before Phase 29 (even 1/3 split, normal
 * interval).
 */
const BANK_RISK_THRESHOLD = 200;

const VALID_TINT = 0x00ff00;
const INVALID_TINT = 0xff0000;
const CLICK_MOVE_THRESHOLD = 6;
const MINIMAP_BORDER_COLOR = 0xffffff;
const MINIMAP_VIEWPORT_COLOR = 0xffee58;
const MINIMAP_VIEWPORT_THROTTLE_MS = 50;
const MINIMAP_BUILDING_DOT_SIZE = 3;
const ANIMAL_SPRITE_DEPTH = 11;
const ANIMAL_SLOT_GAP = 2;
const ANIMAL_SLOT_STEP = ANIMAL_SPRITE_SIZE + ANIMAL_SLOT_GAP;
const ANIMAL_WANDER_RADIUS_MIN = 10;
const ANIMAL_WANDER_RADIUS_MAX = 12;
const ANIMAL_WANDER_BOB_PX = 4;
const ANIMAL_WANDER_DURATION_MIN_MS = 900;
const ANIMAL_WANDER_DURATION_MAX_MS = 1600;
const ANIMAL_WANDER_DELAY_MAX_MS = 1000;

/** Garrisoned Cowboys (Phase 22) share the animal sprites' depth/layer - both are static ground props next to a building. */
const COWBOY_SPRITE_DEPTH = ANIMAL_SPRITE_DEPTH;
const COWBOY_SLOT_GAP = 2;
const COWBOY_SLOT_STEP = COWBOY_SPRITE_SIZE + COWBOY_SLOT_GAP;

/**
 * Phase 28: Cowboy-on-Horse shares the Cowboy's static-prop depth band but
 * needs its own slot-step pair (not COWBOY_SLOT_STEP) since its sprite frame
 * is wider/shorter than the square COWBOY_SPRITE_SIZE - separate X/Y steps
 * (rather than one square step) keep the spawn-slot grid from overlapping.
 */
const MOUNTED_COWBOY_SPRITE_DEPTH = COWBOY_SPRITE_DEPTH;
const MOUNTED_COWBOY_SLOT_GAP = 2;
const MOUNTED_COWBOY_SLOT_STEP_X = MOUNTED_COWBOY_SPRITE_WIDTH + MOUNTED_COWBOY_SLOT_GAP;
const MOUNTED_COWBOY_SLOT_STEP_Y = MOUNTED_COWBOY_SPRITE_HEIGHT + MOUNTED_COWBOY_SLOT_GAP;

/** Idle-animation accents (Phase 19): layered just above a building's own image (depth 10) and below animal sprites (depth 11). */
const ACCENT_DEPTH = 10.5;

const WELL_CRANK_ANGLE_DEG = 15;
const WELL_CRANK_TWEEN_MS = 1000;

const WAREHOUSE_DOOR_SWING_ANGLE_DEG = 8;
const WAREHOUSE_DOOR_TWEEN_MS = 1800;

const SUPERMARKET_AWNING_SCALE_X_MIN = 0.95;
const SUPERMARKET_AWNING_SCALE_X_MAX = 1.05;
const SUPERMARKET_AWNING_TWEEN_MS = 1800;

const CHICKEN_DOOR_SCALE_Y_CLOSED = 0.3;
const CHICKEN_DOOR_DURATION_MIN_MS = 600;
const CHICKEN_DOOR_DURATION_MAX_MS = 900;
const CHICKEN_DOOR_REPEAT_DELAY_MIN_MS = 200;
const CHICKEN_DOOR_REPEAT_DELAY_MAX_MS = 900;

const HOUSE_SMOKE_PUFF_COUNT = 3;
const HOUSE_SMOKE_PUFF_RADIUS = 3;
const HOUSE_SMOKE_COLOR = 0xf5f5f5;
const HOUSE_SMOKE_START_ALPHA = 0.6;
const HOUSE_SMOKE_RISE_PX = 14;
const HOUSE_SMOKE_DURATION_MIN_MS = 1200;
const HOUSE_SMOKE_DURATION_MAX_MS = 1800;
const HOUSE_SMOKE_STAGGER_MS = 500;

/** Above buildings (10), accents (10.5) and animals (11); below the HUD (1000). */
const VILLAGER_SPRITE_DEPTH = 12;
/** Above villagers (12); HP bars sit topmost of the per-building layers so damage is always visible. */
const HP_BAR_DEPTH = 13;
const HP_BAR_HEIGHT = 4;
const HP_BAR_MARGIN_ABOVE_BUILDING = 3;
const HP_BAR_BG_COLOR = 0x2b1d12;
const HP_BAR_FILL_COLOR = 0x4caf50;
const HP_BAR_EMPTY_COLOR = 0xd32f2f;
/** Display-only cap (Phase 20): rendered sprite count, unrelated to gameState's population/workforce numbers. */
const VILLAGER_CAP = 30;
const VILLAGER_WALK_SPEED_PX_PER_SEC = 50;
const VILLAGER_PAUSE_MIN_MS = 500;
const VILLAGER_PAUSE_MAX_MS = 2000;

/**
 * Phase 23 raiders share the villager/animal/cowboy small-unit depth band -
 * just above buildings and accents, below the HP bars that must always read
 * on top of everything they're reporting on.
 */
const RAIDER_SPRITE_DEPTH = 12;
const COWBOY_SHOT_DEPTH = 13.5;
const COWBOY_SHOT_COLOR = 0xffee58;
const COWBOY_SHOT_FADE_MS = 200;

/** Phase 24: Cowboys are player-directed units, so their selection/movement constants live near the combat ones above. */
const COWBOY_WALK_SPEED_PX_PER_SEC = 60;
const COWBOY_SELECT_HIT_RADIUS_PX = 10;
const COWBOY_SELECTION_RING_RADIUS_PX = 10;
const COWBOY_SELECTION_RING_COLOR = 0x42a5f5;
const COWBOY_SELECTION_RING_DEPTH = 13.6;
/** Phase 25: per-unit random offset applied to a multi-unit move order's target point so units don't all walk to the exact same pixel and stack. */
const UNIT_MOVE_ORDER_JITTER_PX = 12;
/** Phase 25: drag-rectangle multi-select box; reuses the selection ring's blue so both read as "the same selection concept". */
const SELECTION_RECT_COLOR = 0x42a5f5;
const SELECTION_RECT_FILL_ALPHA = 0.15;
const SELECTION_RECT_DEPTH = 13.4;

interface BuildingVisual {
  building: PlacedBuilding;
  image: Phaser.GameObjects.Image;
  animalImages: Phaser.GameObjects.Image[];
  accentObjects: Phaser.GameObjects.GameObject[];
}

/**
 * Raiders are NOT tied to a BuildingVisual (unlike animals/cowboys, which are
 * always owned by exactly one building) - they're independent hostile units
 * that roam in from the map edge, so they get their own small scene-level
 * tracking array, mirroring Phase 20's villagers but with more per-unit state.
 * `targetBuildingId` is looked up through gameState.getBuildingById rather
 * than holding a PlacedBuilding reference directly, since a building's own hp
 * (the thing raiders actually damage) lives in gameState and must stay the
 * single source of truth.
 */
interface Raider {
  image: Phaser.GameObjects.Image;
  faction: RaiderFaction;
  hp: number;
  targetBuildingId: string | null;
  /** True once this raider's walk-to-target tween has completed; only then does it attack instead of moving. */
  arrived: boolean;
}

/**
 * Phase 24: a Cowboy is now an independently-positioned, player-directed unit
 * rather than a position purely derived from its Barracks + slot index (Phase
 * 22). It still remembers which Barracks trained it and which cowboyHp slot
 * is "its" HP (gameState.ts stays the single source of truth for HP, same
 * pattern raiders use for building.hp), but its on-screen position is now its
 * own live image.x/y, which can drift away from that slot via a move order.
 * Tracked at scene level (mirroring Raider[] above) rather than inside
 * BuildingVisual, since a Cowboy is no longer owned by its Barracks' visual
 * once it can walk away from it.
 *
 * Named generically (Phase 25) rather than `CowboyUnit`: selection and
 * movement no longer assume a single unit kind, since Phase 28 adds a second
 * player-directed unit (Cowboy on Horse) that plugs into this same
 * selection/move system without needing its own parallel type.
 */
/**
 * Phase 28: the discriminant that lets a single CombatUnit type/tracking
 * array/selection system serve two unit kinds. Kept as a plain string union
 * plus one small lookup table (UNIT_KIND_CONFIG below) rather than a generic
 * "unit type registry" - only walk speed actually varies per kind in this
 * scene (combat range/damage are shared, per the phase spec), so that's all
 * the table carries.
 */
type UnitKind = 'cowboy' | 'cowboyOnHorse';

interface UnitKindConfig {
  walkSpeedPxPerSec: number;
}

const UNIT_KIND_CONFIG: Record<UnitKind, UnitKindConfig> = {
  cowboy: { walkSpeedPxPerSec: COWBOY_WALK_SPEED_PX_PER_SEC },
  cowboyOnHorse: { walkSpeedPxPerSec: MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC },
};

interface CombatUnit {
  image: Phaser.GameObjects.Image;
  barracksId: string;
  index: number;
  moveTween: Phaser.Tweens.Tween | null;
  kind: UnitKind;
}

export class MainScene extends Phaser.Scene {
  private infoText!: Phaser.GameObjects.Text;
  private resourceText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private remainingSecondsDisplay = GAME_DURATION_SECONDS;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private selectedType: BuildingType | null = null;
  private previewImage: Phaser.GameObjects.Image | null = null;
  private buildingVisuals = new Map<string, BuildingVisual>();
  private villagers: Phaser.GameObjects.Image[] = [];
  private raiders: Raider[] = [];
  private raidActive = false;
  private raidNoticeText!: Phaser.GameObjects.Text;
  private raidCheckTimer: Phaser.Time.TimerEvent | null = null;
  private raidWaveTimer: Phaser.Time.TimerEvent | null = null;
  private cowboyShotGraphics: Phaser.GameObjects.Graphics[] = [];
  private cowboyUnits: CombatUnit[] = [];
  private selectedUnits: CombatUnit[] = [];
  private selectionRingGraphics!: Phaser.GameObjects.Graphics;
  private selectionRectGraphics!: Phaser.GameObjects.Graphics;
  private dragStartWorldX = 0;
  private dragStartWorldY = 0;
  private cowboySelectionHintText!: Phaser.GameObjects.Text;
  private connectionGraphics!: Phaser.GameObjects.Graphics;
  private fenceLineGraphics!: Phaser.GameObjects.Graphics;
  private hpBarGraphics!: Phaser.GameObjects.Graphics;
  private lastInfoTileX: number | null = null;
  private lastInfoTileY: number | null = null;
  private tileData: TileType[][] = [];
  private minimapX = 0;
  private minimapY = 0;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private minimapViewportGraphics!: Phaser.GameObjects.Graphics;
  private minimapPointerActive = false;
  private lastMinimapViewportRedraw = 0;

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.buildTilemap();
    this.setupCameraDrag();
    this.setupInfoText();
    this.setupResourceHud();
    this.setupTimerHud();
    this.setupMinimap();
    this.setupBuildingPlacement();
    this.setupBuildingSelection();
    this.setupProductionTimer();
    this.setupConnectionVisuals();
    this.setupFenceVisuals();
    this.setupAnimalVisuals();
    this.setupCowboyVisuals();
    this.setupUnitControl();
    this.setupHpBarVisuals();
    this.setupRaidSystem();
    this.setupGameReset();
  }

  update(): void {
    this.redrawSelectionRing();
  }

  private buildTilemap(): void {
    const map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: MAP_WIDTH_TILES,
      height: MAP_HEIGHT_TILES,
    });

    const tileset = map.addTilesetImage('tiles', TILESET_KEY, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) {
      throw new Error('Failed to load tileset image');
    }

    const layer = map.createBlankLayer('ground', tileset, 0, 0);
    if (!layer) {
      throw new Error('Failed to create ground layer');
    }

    const tileData = generateTileMap();
    this.tileData = tileData;
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        layer.putTileAt(tileData[y][x], x, y);
      }
    }

    this.cameras.main.setBounds(0, 0, MAP_WIDTH_TILES * TILE_SIZE, MAP_HEIGHT_TILES * TILE_SIZE);
  }

  private setupCameraDrag(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.minimapPointerActive) {
        if (pointer.isDown) {
          this.navigateMinimapTo(pointer);
        }
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
        return;
      }

      // Phase 25: camera-pan moved from left-drag to right-drag so left-drag is
      // free for the unit selection rectangle. `pointer.isDown` (used here
      // pre-Phase-25) is true for ANY held button - see Phaser's Pointer.isDown
      // doc ("is _any_ button... considered as being down"), so panning now
      // needs the same explicit rightButtonDown()/leftButtonDown() checks the
      // rest of this file already uses elsewhere (e.g. setupBuildingPlacement).
      if (pointer.rightButtonDown() && this.selectedType === null) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
        this.redrawMinimapViewportThrottled();
      } else if (pointer.leftButtonDown() && this.selectedType === null) {
        this.updateSelectionRectangle(pointer);
      }
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.updateInfoText(pointer);
      this.updatePreview(pointer);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
      this.dragStartWorldX = pointer.worldX;
      this.dragStartWorldY = pointer.worldY;

      this.minimapPointerActive = this.isPointerInMinimap(pointer);
      if (this.minimapPointerActive) {
        this.navigateMinimapTo(pointer);
      }
    });
  }

  /**
   * World-space rectangle (no setScrollFactor(0), same as
   * redrawConnectionOutlines/redrawFenceLines/redrawSelectionRing) drawn
   * between the drag-start point and the current pointer, both captured as
   * world coordinates - not screen coordinates - so the box stays correctly
   * anchored over the ground/units even if the camera scrolls mid-drag.
   */
  private updateSelectionRectangle(pointer: Phaser.Input.Pointer): void {
    this.selectionRectGraphics.clear();

    const dx = pointer.x - this.pointerDownX;
    const dy = pointer.y - this.pointerDownY;
    if (Math.sqrt(dx * dx + dy * dy) <= CLICK_MOVE_THRESHOLD) {
      return;
    }

    const minX = Math.min(this.dragStartWorldX, pointer.worldX);
    const minY = Math.min(this.dragStartWorldY, pointer.worldY);
    const width = Math.abs(pointer.worldX - this.dragStartWorldX);
    const height = Math.abs(pointer.worldY - this.dragStartWorldY);

    this.selectionRectGraphics.fillStyle(SELECTION_RECT_COLOR, SELECTION_RECT_FILL_ALPHA);
    this.selectionRectGraphics.fillRect(minX, minY, width, height);
    this.selectionRectGraphics.lineStyle(1, SELECTION_RECT_COLOR, 1);
    this.selectionRectGraphics.strokeRect(minX, minY, width, height);
  }

  private setupInfoText(): void {
    this.infoText = this.add.text(8, VIEWPORT_HEIGHT - 8, 'tile: -, -', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
    });
    this.infoText.setOrigin(0, 1);
    this.infoText.setScrollFactor(0);
    this.infoText.setDepth(1000);
  }

  private updateInfoText(pointer: Phaser.Input.Pointer): void {
    const { tileX, tileY } = this.pointerToTile(pointer);
    if (tileX === this.lastInfoTileX && tileY === this.lastInfoTileY) {
      return;
    }
    this.lastInfoTileX = tileX;
    this.lastInfoTileY = tileY;
    this.infoText.setText(`tile: ${tileX}, ${tileY}`);
  }

  private setupResourceHud(): void {
    this.resourceText = this.add.text(8, 8, this.formatResourceText(), {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
    });
    this.resourceText.setScrollFactor(0);
    this.resourceText.setDepth(1000);

    gameEvents.on('money-changed', () => this.resourceText.setText(this.formatResourceText()));
    gameEvents.on('resources-changed', () => this.resourceText.setText(this.formatResourceText()));
    gameEvents.on('production-tick', () => this.resourceText.setText(this.formatResourceText()));
  }

  private formatResourceText(): string {
    const { rawMeat, meat, water, eggs, leather, clothes, logs, wood, potatoes, liquor } = getResources();
    const fmt = (n: number) => Math.round(n * 10) / 10;
    return (
      `Money: $${fmt(getMoney())} | Population: ${getEmployedPopulation()}/${getTotalPopulation()} | Storage cap: ${getStorageCap()}\n` +
      `Raw Meat: ${fmt(rawMeat)} | Meat: ${fmt(meat)} | Water: ${fmt(water)} | Eggs: ${fmt(eggs)} | Leather: ${fmt(leather)}\n` +
      `Clothes: ${fmt(clothes)} | Logs: ${fmt(logs)} | Wood: ${fmt(wood)} | Potatoes: ${fmt(potatoes)} | Liquor: ${fmt(liquor)}`
    );
  }

  /**
   * Raid combat resolution rides the same 2s cadence as production instead of
   * its own timer: it's already the game's "slow tick" for anything that
   * shouldn't run per-frame, and running it right after production means a
   * building's HP regen (inside runProductionTick) and that tick's raider
   * damage are both settled before the HP bars redraw.
   */
  private setupProductionTimer(): void {
    this.time.addEvent({
      delay: PRODUCTION_TICK_MS,
      loop: true,
      callback: () => {
        runProductionTick();
        this.runRaidCombatTick();
      },
    });
  }

  private setupTimerHud(): void {
    this.timerText = this.add.text(VIEWPORT_WIDTH - 8, 8, this.formatTimerText(), {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
      align: 'right',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setScrollFactor(0);
    this.timerText.setDepth(1000);

    gameEvents.on('timer-changed', (remainingSeconds: number) => {
      this.remainingSecondsDisplay = remainingSeconds;
      this.timerText.setText(this.formatTimerText());
    });
    gameEvents.on('production-tick', () => {
      this.timerText.setText(this.formatTimerText());
    });

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => tickTimer(),
    });
  }

  private formatTimerText(): string {
    const minutes = Math.floor(this.remainingSecondsDisplay / 60);
    const seconds = this.remainingSecondsDisplay % 60;
    const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return `Time: ${time} | Meat score: ${Math.round(getTotalMeatProduced() * 10) / 10}`;
  }

  private setupMinimap(): void {
    this.minimapX = MINIMAP_MARGIN;
    this.minimapY = this.resourceText.y + this.resourceText.height + MINIMAP_MARGIN;

    this.minimapGraphics = this.add.graphics();
    this.minimapGraphics.setScrollFactor(0);
    this.minimapGraphics.setDepth(1000);

    this.minimapViewportGraphics = this.add.graphics();
    this.minimapViewportGraphics.setScrollFactor(0);
    this.minimapViewportGraphics.setDepth(1001);

    this.redrawMinimap();

    gameEvents.on('building-placed', () => this.redrawMinimap());
    gameEvents.on('game-reset', () => this.redrawMinimap());
  }

  private redrawMinimap(): void {
    this.minimapGraphics.clear();

    const tileWidth = MINIMAP_WIDTH / MAP_WIDTH_TILES;
    const tileHeight = MINIMAP_HEIGHT / MAP_HEIGHT_TILES;

    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const tileType = this.tileData[y]?.[x] ?? TileType.Grass;
        this.minimapGraphics.fillStyle(TILE_COLORS[tileType], 1);
        this.minimapGraphics.fillRect(
          this.minimapX + x * tileWidth,
          this.minimapY + y * tileHeight,
          tileWidth,
          tileHeight,
        );
      }
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

    this.minimapGraphics.lineStyle(1, MINIMAP_BORDER_COLOR, 0.8);
    this.minimapGraphics.strokeRect(this.minimapX, this.minimapY, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    this.redrawMinimapViewport();
  }

  private redrawMinimapViewportThrottled(): void {
    const now = this.time.now;
    if (now - this.lastMinimapViewportRedraw < MINIMAP_VIEWPORT_THROTTLE_MS) {
      return;
    }
    this.lastMinimapViewportRedraw = now;
    this.redrawMinimapViewport();
  }

  private redrawMinimapViewport(): void {
    this.minimapViewportGraphics.clear();

    const worldView = this.cameras.main.worldView;
    const mapPixelWidth = MAP_WIDTH_TILES * TILE_SIZE;
    const mapPixelHeight = MAP_HEIGHT_TILES * TILE_SIZE;

    const rectX = this.minimapX + (worldView.x / mapPixelWidth) * MINIMAP_WIDTH;
    const rectY = this.minimapY + (worldView.y / mapPixelHeight) * MINIMAP_HEIGHT;
    const rectW = (worldView.width / mapPixelWidth) * MINIMAP_WIDTH;
    const rectH = (worldView.height / mapPixelHeight) * MINIMAP_HEIGHT;

    this.minimapViewportGraphics.lineStyle(2, MINIMAP_VIEWPORT_COLOR, 1);
    this.minimapViewportGraphics.strokeRect(rectX, rectY, rectW, rectH);
  }

  private isPointerInMinimap(pointer: Phaser.Input.Pointer): boolean {
    return (
      pointer.x >= this.minimapX &&
      pointer.x <= this.minimapX + MINIMAP_WIDTH &&
      pointer.y >= this.minimapY &&
      pointer.y <= this.minimapY + MINIMAP_HEIGHT
    );
  }

  private navigateMinimapTo(pointer: Phaser.Input.Pointer): void {
    const relX = Phaser.Math.Clamp(pointer.x - this.minimapX, 0, MINIMAP_WIDTH);
    const relY = Phaser.Math.Clamp(pointer.y - this.minimapY, 0, MINIMAP_HEIGHT);
    const worldX = (relX / MINIMAP_WIDTH) * MAP_WIDTH_TILES * TILE_SIZE;
    const worldY = (relY / MINIMAP_HEIGHT) * MAP_HEIGHT_TILES * TILE_SIZE;
    // Camera bounds set in buildTilemap() clamp the scroll automatically.
    this.cameras.main.centerOn(worldX, worldY);
    this.redrawMinimapViewportThrottled();
  }

  private setupBuildingPlacement(): void {
    this.input.mouse?.disableContextMenu();

    gameEvents.on('select-building', (type: BuildingType) => {
      this.selectedType = type;
      this.refreshPreviewTexture();
    });

    gameEvents.on('cancel-placement', () => {
      this.cancelPlacement();
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      gameEvents.emit('cancel-placement');
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerInMinimap(pointer)) {
        return;
      }
      if (pointer.rightButtonDown()) {
        gameEvents.emit('cancel-placement');
        return;
      }
      if (this.selectedType !== null && pointer.leftButtonDown()) {
        this.tryPlaceAt(pointer);
      }
    });
  }

  private setupBuildingSelection(): void {
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasMinimapClick = this.minimapPointerActive;
      this.minimapPointerActive = false;
      if (wasMinimapClick) {
        return;
      }

      if (this.selectedType !== null) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_THRESHOLD) {
        return;
      }

      const { tileX, tileY } = this.pointerToTile(pointer);
      const building = getBuildingAtTile(tileX, tileY);

      gameEvents.emit('building-selected', building);
    });
  }

  private refreshPreviewTexture(): void {
    if (this.selectedType === null) {
      return;
    }

    this.previewImage?.destroy();
    this.previewImage = this.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(this.selectedType));
    this.previewImage.setOrigin(0, 0);
    this.previewImage.setAlpha(0.6);
    this.previewImage.setDepth(500);
  }

  private cancelPlacement(): void {
    this.selectedType = null;
    this.previewImage?.destroy();
    this.previewImage = null;
  }

  private updatePreview(pointer: Phaser.Input.Pointer): void {
    if (this.selectedType === null || !this.previewImage) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    this.previewImage.setPosition(tileX * TILE_SIZE, tileY * TILE_SIZE);

    const valid = canPlaceBuilding(tileX, tileY, this.selectedType);
    this.previewImage.setTint(valid ? VALID_TINT : INVALID_TINT);
  }

  private tryPlaceAt(pointer: Phaser.Input.Pointer): void {
    if (this.selectedType === null) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    const building = placeBuilding(tileX, tileY, this.selectedType);
    if (!building) {
      return;
    }

    const image = this.add
      .image(
        building.tileX * TILE_SIZE,
        building.tileY * TILE_SIZE,
        BUILDING_ATLAS_KEY,
        buildingTextureKey(building.type),
      )
      .setOrigin(0, 0)
      .setDepth(10);

    const visual: BuildingVisual = { building, image, animalImages: [], accentObjects: [] };
    this.buildingVisuals.set(building.id, visual);
    if (building.type === BuildingType.Fence) {
      // connections-updated already fired before this building's visual existed; redraw now that it does.
      this.redrawFenceLines();
    }
    this.redrawAnimalSprites(visual);
    // A freshly placed Barracks always starts with cowboyCount 0 (see gameState.ts), so there is
    // nothing to spawn here - Cowboy units only ever appear via the 'cowboy-trained' event below.
    this.createBuildingAccents(visual);
    if (building.type === BuildingType.House) {
      this.spawnVillagersForHouse(building);
    }
    playPlacementSound();
  }

  /** Building-type-gated idle-animation accents (Phase 19); only these 5 types get one, everything else gets nothing. */
  private createBuildingAccents(visual: BuildingVisual): void {
    const { building } = visual;
    const originX = building.tileX * TILE_SIZE;
    const originY = building.tileY * TILE_SIZE;

    switch (building.type) {
      case BuildingType.Well:
        visual.accentObjects.push(this.createWellCrankAccent(originX, originY));
        break;
      case BuildingType.Warehouse:
        visual.accentObjects.push(this.createWarehouseDoorAccent(originX, originY));
        break;
      case BuildingType.Supermarket:
        visual.accentObjects.push(this.createSupermarketAwningAccent(originX, originY));
        break;
      case BuildingType.ChickenFarm:
        visual.accentObjects.push(this.createChickenDoorAccent(originX, originY));
        break;
      case BuildingType.House:
        visual.accentObjects.push(...this.createHouseSmokeAccents(originX, originY));
        break;
      default:
        break;
    }
  }

  private createAccentImage(x: number, y: number, kind: AccentKind): Phaser.GameObjects.Image {
    return this.add.image(x, y, ACCENTS_ATLAS_KEY, accentTextureKey(kind)).setDepth(ACCENT_DEPTH);
  }

  /** Crank bar pivots from its own center, between the well's support posts; starts at -15deg so the yoyo tween sweeps it through 0 up to +15deg. */
  private createWellCrankAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const crank = this.createAccentImage(originX + 16, originY + 2, 'WellCrank').setOrigin(0.5, 0.5);
    crank.setAngle(-WELL_CRANK_ANGLE_DEG);

    this.tweens.add({
      targets: crank,
      angle: WELL_CRANK_ANGLE_DEG,
      duration: WELL_CRANK_TWEEN_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return crank;
  }

  /**
   * Pivots from its top edge (hinge) rather than a symmetric center swing:
   * a real hay-loft door only opens outward one way, and a top-hinged swing
   * reads more clearly at this scale than the doc's suggested -8/+8 center
   * rotation, which looked like the whole door wobbling in place.
   */
  private createWarehouseDoorAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const door = this.createAccentImage(originX + 28, originY + 24, 'WarehouseDoor').setOrigin(0.5, 0);

    this.tweens.add({
      targets: door,
      angle: WAREHOUSE_DOOR_SWING_ANGLE_DEG,
      duration: WAREHOUSE_DOOR_TWEEN_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return door;
  }

  private createSupermarketAwningAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const awning = this.createAccentImage(originX + 32, originY + 8, 'SupermarketAwning').setOrigin(0.5, 0.5);
    awning.setScale(SUPERMARKET_AWNING_SCALE_X_MIN, 1);

    this.tweens.add({
      targets: awning,
      scaleX: SUPERMARKET_AWNING_SCALE_X_MAX,
      duration: SUPERMARKET_AWNING_TWEEN_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return awning;
  }

  /**
   * Duration and repeatDelay are randomized once per building instance (not
   * per repeat cycle - Phaser tween repeatDelay is fixed once the tween is
   * created) so multiple chicken farms don't flap in lockstep; each single
   * building's own cycle stays regular.
   */
  private createChickenDoorAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const door = this.createAccentImage(originX + 16, originY + 28, 'ChickenDoor').setOrigin(0.5, 1);
    const duration = Phaser.Math.Between(CHICKEN_DOOR_DURATION_MIN_MS, CHICKEN_DOOR_DURATION_MAX_MS);
    const repeatDelay = Phaser.Math.Between(CHICKEN_DOOR_REPEAT_DELAY_MIN_MS, CHICKEN_DOOR_REPEAT_DELAY_MAX_MS);
    const delay = Phaser.Math.Between(0, CHICKEN_DOOR_REPEAT_DELAY_MAX_MS);

    this.tweens.add({
      targets: door,
      scaleY: CHICKEN_DOOR_SCALE_Y_CLOSED,
      duration,
      delay,
      repeatDelay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return door;
  }

  /**
   * Three plain circles rather than atlas sprites - a fading puff has no
   * silhouette detail worth pixel-art treatment. Each tween's `repeat: -1`
   * automatically snaps y/alpha back to their starting values before
   * re-running, so no manual reset is needed; the staggered `delay` per
   * puff is what keeps them from rising in sync.
   */
  private createHouseSmokeAccents(originX: number, originY: number): Phaser.GameObjects.Arc[] {
    const startX = originX + 16;
    const startY = originY + 2;
    const puffs: Phaser.GameObjects.Arc[] = [];

    for (let index = 0; index < HOUSE_SMOKE_PUFF_COUNT; index++) {
      const puff = this.add
        .circle(startX, startY, HOUSE_SMOKE_PUFF_RADIUS, HOUSE_SMOKE_COLOR, HOUSE_SMOKE_START_ALPHA)
        .setDepth(ACCENT_DEPTH);
      const duration = Phaser.Math.Between(HOUSE_SMOKE_DURATION_MIN_MS, HOUSE_SMOKE_DURATION_MAX_MS);

      this.tweens.add({
        targets: puff,
        y: startY - HOUSE_SMOKE_RISE_PX,
        alpha: 0,
        duration,
        delay: index * HOUSE_SMOKE_STAGGER_MS,
        repeat: -1,
        ease: 'Sine.easeOut',
      });

      puffs.push(puff);
    }

    return puffs;
  }

  private setupConnectionVisuals(): void {
    this.connectionGraphics = this.add.graphics();
    this.connectionGraphics.setDepth(20);

    gameEvents.on('connections-updated', () => this.redrawConnectionOutlines());
  }

  private redrawConnectionOutlines(): void {
    this.connectionGraphics.clear();
    this.connectionGraphics.lineStyle(3, 0x00ff00, 1);

    for (const { building } of this.buildingVisuals.values()) {
      if (!building.connected) {
        continue;
      }
      const { width, height } = BUILDING_DEFINITIONS[building.type].size;
      const px = building.tileX * TILE_SIZE;
      const py = building.tileY * TILE_SIZE;
      this.connectionGraphics.strokeRect(px + 1, py + 1, width * TILE_SIZE - 2, height * TILE_SIZE - 2);
    }
  }

  private setupFenceVisuals(): void {
    this.fenceLineGraphics = this.add.graphics();
    this.fenceLineGraphics.setDepth(15);

    gameEvents.on('connections-updated', () => this.redrawFenceLines());
  }

  private redrawFenceLines(): void {
    this.fenceLineGraphics.clear();
    this.fenceLineGraphics.lineStyle(4, FENCE_LINE_COLOR, 1);

    for (const { fromId, toId } of getFenceLinks()) {
      const from = this.buildingVisuals.get(fromId);
      const to = this.buildingVisuals.get(toId);
      if (!from || !to) {
        continue;
      }
      const fromCenter = this.tileCenter(from.building);
      const toCenter = this.tileCenter(to.building);
      this.fenceLineGraphics.lineBetween(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
    }
  }

  private setupHpBarVisuals(): void {
    this.hpBarGraphics = this.add.graphics();
    this.hpBarGraphics.setDepth(HP_BAR_DEPTH);

    // Redrawn every tick (cheap at this building count) rather than only on
    // damage events, since no damage source exists yet - this keeps the bars
    // correct automatically once one is added later.
    gameEvents.on('production-tick', () => this.redrawHpBars());
  }

  private redrawHpBars(): void {
    this.hpBarGraphics.clear();

    for (const { building } of this.buildingVisuals.values()) {
      const { size, maxHp } = BUILDING_DEFINITIONS[building.type];
      if (building.hp >= maxHp) {
        continue;
      }

      const barWidth = size.width * TILE_SIZE - 4;
      const px = building.tileX * TILE_SIZE + 2;
      const py = building.tileY * TILE_SIZE - HP_BAR_HEIGHT - HP_BAR_MARGIN_ABOVE_BUILDING;
      const ratio = Math.max(0, building.hp / maxHp);

      this.hpBarGraphics.fillStyle(HP_BAR_BG_COLOR, 1);
      this.hpBarGraphics.fillRect(px, py, barWidth, HP_BAR_HEIGHT);
      this.hpBarGraphics.fillStyle(ratio > 0 ? HP_BAR_FILL_COLOR : HP_BAR_EMPTY_COLOR, 1);
      this.hpBarGraphics.fillRect(px, py, barWidth * ratio, HP_BAR_HEIGHT);
    }
  }

  private tileCenter(building: PlacedBuilding): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    return {
      x: building.tileX * TILE_SIZE + (width * TILE_SIZE) / 2,
      y: building.tileY * TILE_SIZE + (height * TILE_SIZE) / 2,
    };
  }

  private setupAnimalVisuals(): void {
    gameEvents.on('animal-bought', (building: PlacedBuilding) => {
      const visual = this.buildingVisuals.get(building.id);
      if (visual) {
        this.redrawAnimalSprites(visual);
      }
    });
  }

  /** Only called on placement and 'animal-bought' (i.e. when animalCount actually changes), never per production tick. */
  private redrawAnimalSprites(visual: BuildingVisual): void {
    for (const animalImage of visual.animalImages) {
      this.tweens.killTweensOf(animalImage);
      animalImage.destroy();
    }
    visual.animalImages = [];

    const animalConfig = BUILDING_DEFINITIONS[visual.building.type].animal;
    if (!animalConfig) {
      return;
    }

    for (let index = 0; index < visual.building.animalCount; index++) {
      const slot = this.getAnimalSlotPosition(visual.building, index);
      const animalImage = this.add
        .image(slot.x, slot.y, ANIMALS_ATLAS_KEY, animalTextureKey(animalConfig.animalLabel))
        .setDepth(ANIMAL_SPRITE_DEPTH);
      visual.animalImages.push(animalImage);
      this.startAnimalWander(animalImage, slot);
    }
  }

  /**
   * Confined wander: a single yoyo-ing tween drifts the sprite between its
   * slot anchor and a randomized offset point (+ a subtle vertical bob),
   * looping forever. `direction` records which way the sprite faces during
   * the outbound half of the cycle; `onYoyo` (outbound leg finished, tween
   * reverses back toward the anchor) and `onRepeat` (return leg finished,
   * tween restarts outbound) fire exactly at the two points the movement
   * direction flips, so flipping the sprite there is enough to always face
   * the way it's currently moving without tracking position every frame.
   */
  private startAnimalWander(animalImage: Phaser.GameObjects.Image, slot: { x: number; y: number }): void {
    const radiusX = Phaser.Math.Between(ANIMAL_WANDER_RADIUS_MIN, ANIMAL_WANDER_RADIUS_MAX);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const targetX = slot.x + radiusX * direction;
    const targetY = slot.y + Phaser.Math.Between(-ANIMAL_WANDER_BOB_PX, ANIMAL_WANDER_BOB_PX);
    const duration = Phaser.Math.Between(ANIMAL_WANDER_DURATION_MIN_MS, ANIMAL_WANDER_DURATION_MAX_MS);
    const delay = Phaser.Math.Between(0, ANIMAL_WANDER_DELAY_MAX_MS);

    animalImage.setFlipX(direction < 0);

    this.tweens.add({
      targets: animalImage,
      x: targetX,
      y: targetY,
      duration,
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onYoyo: () => animalImage.setFlipX(direction >= 0),
      onRepeat: () => animalImage.setFlipX(direction < 0),
    });
  }

  /**
   * Deterministic per-index slot: a row of critters just beneath the
   * building's footprint (its yard), wrapping into further rows once a row
   * fills up, so slot N always lands in the same spot and never overlaps
   * the building sprite itself.
   */
  private getAnimalSlotPosition(building: PlacedBuilding, index: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / ANIMAL_SLOT_STEP));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const rowPxWidth = columns * ANIMAL_SLOT_STEP - ANIMAL_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + ANIMAL_SLOT_STEP / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + ANIMAL_SLOT_STEP / 2;

    return {
      x: startX + col * ANIMAL_SLOT_STEP,
      y: startY + row * ANIMAL_SLOT_STEP,
    };
  }

  private setupCowboyVisuals(): void {
    gameEvents.on('cowboy-trained', (building: PlacedBuilding) => {
      // Phase 24: training used to destroy-and-recreate the Barracks' whole cowboy
      // sprite set (redrawCowboySprites), which was harmless while position was
      // purely derived from index. Now that a Cowboy can carry a live position and
      // an in-flight move order, destroying siblings on every train would wipe
      // that out - so this only ever ADDS the one newly trained unit (its slot is
      // always cowboyHp.length - 1, the index gameState.trainCowboy just pushed).
      this.spawnCowboyUnit(building, building.cowboyHp.length - 1);
    });

    // Same "only add the newly trained one" rule as 'cowboy-trained' above (Phase 24).
    gameEvents.on('mounted-cowboy-trained', (building: PlacedBuilding) => {
      this.spawnMountedCowboyUnit(building, building.mountedCowboyHp.length - 1);
    });
  }

  private spawnCowboyUnit(building: PlacedBuilding, index: number): void {
    const slot = this.getCowboySlotPosition(building, index);
    const image = this.add
      .image(slot.x, slot.y, COWBOYS_ATLAS_KEY, COWBOY_TEXTURE_KEY)
      .setDepth(COWBOY_SPRITE_DEPTH);
    this.cowboyUnits.push({ image, barracksId: building.id, index, moveTween: null, kind: 'cowboy' });
  }

  /** Mirrors spawnCowboyUnit exactly, spawning at a Horsery's mounted-slot layout and tagging the unit 'cowboyOnHorse'. */
  private spawnMountedCowboyUnit(building: PlacedBuilding, index: number): void {
    const slot = this.getMountedCowboySlotPosition(building, index);
    const image = this.add
      .image(slot.x, slot.y, MOUNTED_COWBOYS_ATLAS_KEY, MOUNTED_COWBOY_TEXTURE_KEY)
      .setDepth(MOUNTED_COWBOY_SPRITE_DEPTH);
    this.cowboyUnits.push({ image, barracksId: building.id, index, moveTween: null, kind: 'cowboyOnHorse' });
  }

  /** Same deterministic row/column slot layout as getAnimalSlotPosition; still used as a Cowboy's spawn point, just no longer as its "current position" for combat. */
  private getCowboySlotPosition(building: PlacedBuilding, index: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / COWBOY_SLOT_STEP));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const rowPxWidth = columns * COWBOY_SLOT_STEP - COWBOY_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + COWBOY_SLOT_STEP / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + COWBOY_SLOT_STEP / 2;

    return {
      x: startX + col * COWBOY_SLOT_STEP,
      y: startY + row * COWBOY_SLOT_STEP,
    };
  }

  /** Same deterministic row/column slot layout as getCowboySlotPosition, but stepped by MOUNTED_COWBOY_SLOT_STEP_X/Y since its sprite frame isn't square. */
  private getMountedCowboySlotPosition(building: PlacedBuilding, index: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / MOUNTED_COWBOY_SLOT_STEP_X));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const rowPxWidth = columns * MOUNTED_COWBOY_SLOT_STEP_X - MOUNTED_COWBOY_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + MOUNTED_COWBOY_SLOT_STEP_X / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + MOUNTED_COWBOY_SLOT_STEP_Y / 2;

    return {
      x: startX + col * MOUNTED_COWBOY_SLOT_STEP_X,
      y: startY + row * MOUNTED_COWBOY_SLOT_STEP_Y,
    };
  }

  /**
   * A unit is combat-eligible/selectable only while both its training
   * building and its own HP slot are alive - dead/destroyed either way, it no
   * longer defends. Branches on `kind` to read the correct parallel HP array
   * (Barracks' cowboyHp vs Horsery's mountedCowboyHp) since the two never
   * share an index space.
   */
  private isCowboyUnitAlive(unit: CombatUnit): boolean {
    const building = getBuildingById(unit.barracksId);
    if (!building || building.hp <= 0) {
      return false;
    }
    const hp = unit.kind === 'cowboy' ? building.cowboyHp[unit.index] : building.mountedCowboyHp[unit.index];
    return (hp ?? 0) > 0;
  }

  /**
   * Registers unit selection and move orders (both on pointerup - Phase 25
   * moved move orders off pointerdown, see below) as their own listener
   * rather than folding them into setupBuildingPlacement/setupBuildingSelection.
   * Phaser fires every listener registered for the same event, in
   * registration order, so this coexists safely with the existing handlers:
   * emitting 'cancel-placement' on right pointerdown while selectedType is
   * already null (setupBuildingPlacement's rightButtonDown branch) is a
   * verified no-op (see cancelPlacement), and the minimap guard here is
   * re-checked directly via isPointerInMinimap(pointer) rather than trusting
   * this.minimapPointerActive, since setupBuildingSelection's own pointerup
   * handler (registered earlier) already resets that flag to false by the
   * time this one runs.
   *
   * Phase 24 issued the move order on pointerdown (right button), which
   * worked for single-click-to-move but can't distinguish a right-click from
   * the start of a right-drag-to-pan (Phase 25). Both selection and move
   * orders now resolve on pointerup, gated on which button was just released
   * (leftButtonReleased()/rightButtonReleased()) and on the same
   * click-vs-drag distance threshold used everywhere else in this file - a
   * right release past the threshold was a pan, not a command.
   *
   * Left-click selection intentionally does NOT suppress the existing
   * building-info-panel click handling - both fire on the same click. Picking
   * a unit is a separate, additive concern from building selection; a player
   * clicking a unit standing on/near a building plausibly wants to see both,
   * and suppressing one would just be a surprising special case.
   */
  private setupUnitControl(): void {
    this.selectionRingGraphics = this.add.graphics().setDepth(COWBOY_SELECTION_RING_DEPTH);
    this.selectionRectGraphics = this.add.graphics().setDepth(SELECTION_RECT_DEPTH);

    this.cowboySelectionHintText = this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 8, 'Unit(s) selected - right-click to move', {
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#2b1d12cc',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // The drag rectangle (if any) always ends here, regardless of which
      // guard below fires next, so no stray box can ever outlive its drag.
      this.selectionRectGraphics.clear();

      if (this.selectedType !== null || this.isPointerInMinimap(pointer)) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);

      if (pointer.rightButtonReleased()) {
        if (dragDistance > CLICK_MOVE_THRESHOLD || this.selectedUnits.length === 0) {
          return;
        }
        this.issueUnitMoveOrders(pointer);
        return;
      }

      if (!pointer.leftButtonReleased()) {
        return;
      }

      if (dragDistance <= CLICK_MOVE_THRESHOLD) {
        this.selectUnitAt(pointer);
      } else {
        this.selectUnitsInRect(this.dragStartWorldX, this.dragStartWorldY, pointer.worldX, pointer.worldY);
      }
    });
  }

  private selectUnitAt(pointer: Phaser.Input.Pointer): void {
    let hit: CombatUnit | null = null;
    let bestDistance = COWBOY_SELECT_HIT_RADIUS_PX;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, unit.image.x, unit.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        hit = unit;
      }
    }

    this.selectedUnits = hit ? [hit] : [];
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /** Every living unit whose position falls within the released drag rectangle (world-space corners, order-independent). */
  private selectUnitsInRect(x1: number, y1: number, x2: number, y2: number): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    this.selectedUnits = this.cowboyUnits.filter(
      (unit) =>
        this.isCowboyUnitAlive(unit) &&
        unit.image.x >= minX &&
        unit.image.x <= maxX &&
        unit.image.y >= minY &&
        unit.image.y <= maxY,
    );
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /** One move order per selected unit, each aimed at the click point plus a small random offset so a multi-unit order doesn't stack every unit on one pixel. */
  private issueUnitMoveOrders(pointer: Phaser.Input.Pointer): void {
    for (const unit of this.selectedUnits) {
      const jitterX = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      const jitterY = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      this.issueUnitMoveOrder(unit, pointer.worldX + jitterX, pointer.worldY + jitterY);
    }
  }

  /** Same point-to-point tween technique as villagers/raiders (distance/speed -> duration, setFlipX for facing), clamped to map bounds. */
  private issueUnitMoveOrder(unit: CombatUnit, targetWorldX: number, targetWorldY: number): void {
    const targetX = Phaser.Math.Clamp(targetWorldX, 0, MAP_WIDTH_TILES * TILE_SIZE);
    const targetY = Phaser.Math.Clamp(targetWorldY, 0, MAP_HEIGHT_TILES * TILE_SIZE);

    unit.moveTween?.stop();
    unit.image.setFlipX(targetX < unit.image.x);

    const distance = Phaser.Math.Distance.Between(unit.image.x, unit.image.y, targetX, targetY);
    const duration = (distance / UNIT_KIND_CONFIG[unit.kind].walkSpeedPxPerSec) * 1000;

    unit.moveTween = this.tweens.add({
      targets: unit.image,
      x: targetX,
      y: targetY,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        unit.moveTween = null;
      },
    });
  }

  /** Redrawn every frame (update()) rather than on an event, since it must visually track units mid-move-tween; cheap at this unit count. One ring per selected unit (Phase 25). */
  private redrawSelectionRing(): void {
    this.selectionRingGraphics.clear();
    if (this.selectedUnits.length === 0) {
      return;
    }
    this.selectionRingGraphics.lineStyle(2, COWBOY_SELECTION_RING_COLOR, 1);
    for (const unit of this.selectedUnits) {
      this.selectionRingGraphics.strokeCircle(unit.image.x, unit.image.y, COWBOY_SELECTION_RING_RADIUS_PX);
    }
  }

  /**
   * Spawns POPULATION_PER_HOUSE sprites per House placement (population
   * capacity, not employment - employment is recomputed every tick and
   * shouldn't churn sprites in/out). Capped at VILLAGER_CAP total for
   * performance, so a later House may spawn fewer (or none).
   */
  private spawnVillagersForHouse(building: PlacedBuilding): void {
    const spawnCount = Math.min(POPULATION_PER_HOUSE, VILLAGER_CAP - this.villagers.length);
    const origin = this.tileCenter(building);

    for (let index = 0; index < spawnCount; index++) {
      const villager = this.add
        .image(origin.x, origin.y, VILLAGERS_ATLAS_KEY, VILLAGER_TEXTURE_KEY)
        .setDepth(VILLAGER_SPRITE_DEPTH);
      this.villagers.push(villager);
      this.startVillagerWander(villager);
    }
  }

  /**
   * Point-to-point wander, one leg at a time: each leg is its own tween,
   * chained via onComplete rather than a single repeating/yoyo tween, since
   * every leg goes to a fresh random target instead of bouncing between two
   * fixed points. `villager.active` is checked on every (re-)entry so a
   * pending post-reset callback (scheduled before game-reset destroyed this
   * sprite) quietly stops the loop instead of animating a dead image.
   */
  private startVillagerWander(villager: Phaser.GameObjects.Image): void {
    if (!villager.active) {
      return;
    }

    const target = this.pickVillagerTarget();
    const distance = Phaser.Math.Distance.Between(villager.x, villager.y, target.x, target.y);
    const duration = (distance / VILLAGER_WALK_SPEED_PX_PER_SEC) * 1000;

    villager.setFlipX(target.x < villager.x);

    this.tweens.add({
      targets: villager,
      x: target.x,
      y: target.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        const pause = Phaser.Math.Between(VILLAGER_PAUSE_MIN_MS, VILLAGER_PAUSE_MAX_MS);
        this.time.delayedCall(pause, () => this.startVillagerWander(villager));
      },
    });
  }

  /** Random placed building's tile center; always at least the villager's own House, since it's placed before this is ever called. Clamped defensively in case a future building type ever sits outside map bounds. */
  private pickVillagerTarget(): { x: number; y: number } {
    const buildings = getPlacedBuildings();
    const building = buildings[Phaser.Math.Between(0, buildings.length - 1)];
    const center = this.tileCenter(building);

    return {
      x: Phaser.Math.Clamp(center.x, 0, MAP_WIDTH_TILES * TILE_SIZE),
      y: Phaser.Math.Clamp(center.y, 0, MAP_HEIGHT_TILES * TILE_SIZE),
    };
  }

  private setupGameReset(): void {
    gameEvents.on('game-reset', () => {
      this.cancelPlacement();
      gameEvents.emit('building-selected', null);

      for (const { image, animalImages, accentObjects } of this.buildingVisuals.values()) {
        image.destroy();
        for (const animalImage of animalImages) {
          this.tweens.killTweensOf(animalImage);
          animalImage.destroy();
        }
        for (const accentObject of accentObjects) {
          this.tweens.killTweensOf(accentObject);
          accentObject.destroy();
        }
      }
      this.buildingVisuals.clear();
      this.connectionGraphics.clear();
      this.fenceLineGraphics.clear();
      this.hpBarGraphics.clear();

      for (const villager of this.villagers) {
        this.tweens.killTweensOf(villager);
        villager.destroy();
      }
      this.villagers = [];

      for (const unit of this.cowboyUnits) {
        unit.moveTween?.stop();
        unit.image.destroy();
      }
      this.cowboyUnits = [];
      this.selectedUnits = [];
      this.selectionRingGraphics.clear();
      this.selectionRectGraphics.clear();
      this.cowboySelectionHintText.setVisible(false);

      this.resetRaidState();
    });
  }

  /**
   * Phase 23: raid events & combat. Raiders and all their state (hp, target,
   * tween) live entirely in this scene rather than gameState.ts - unlike
   * animals/cowboys they aren't owned by a single building, and unlike core
   * resources/hp they're ephemeral, wave-scoped, and Phaser-tween-heavy, so
   * splitting them into gameState.ts would only add cross-file plumbing for
   * state nothing outside this scene needs. The one place they DO reach into
   * gameState is building.hp: that's core game state (already mutated
   * in-place elsewhere, e.g. runHpRegen), so raiders read it via
   * getBuildingById/getPlacedBuildings and write it directly rather than
   * duplicating it locally.
   */
  private setupRaidSystem(): void {
    this.raidNoticeText = this.add.text(VIEWPORT_WIDTH / 2, 40, '', {
      fontSize: '20px',
      color: '#ffeb3b',
      backgroundColor: '#2b1d12cc',
      padding: { x: 10, y: 6 },
    });
    this.raidNoticeText.setOrigin(0.5, 0);
    this.raidNoticeText.setScrollFactor(0);
    this.raidNoticeText.setDepth(1000);
    this.raidNoticeText.setVisible(false);

    this.scheduleNextRaidCheck();
  }

  /**
   * Rechecks on a freshly-randomized 45-90s delay every time (rather than
   * only after a raid ends) so raid frequency stays independent of how long
   * any given wave lasts; the "only trigger if none active" rule is enforced
   * inside by simply skipping the spawn when one already is.
   */
  private scheduleNextRaidCheck(): void {
    // Below BANK_RISK_THRESHOLD this is byte-identical to the pre-Phase-29
    // interval roll; at/above it both bounds are halved, so raids come
    // roughly twice as often on top of the Outlaw-biased pick below.
    const bankAtRisk = getTotalBankBalance() >= BANK_RISK_THRESHOLD;
    const delay = bankAtRisk
      ? Phaser.Math.Between(RAID_MIN_INTERVAL_MS / 2, RAID_MAX_INTERVAL_MS / 2)
      : Phaser.Math.Between(RAID_MIN_INTERVAL_MS, RAID_MAX_INTERVAL_MS);
    this.raidCheckTimer = this.time.delayedCall(delay, () => {
      if (!this.raidActive) {
        this.startRaid();
      }
      this.scheduleNextRaidCheck();
    });
  }

  /**
   * Below BANK_RISK_THRESHOLD: identical to the original even pick across
   * Object.values(RaiderFaction). At/above it: a full bank draws outsized
   * Outlaw attention (60% Outlaws / 20% Rustlers / 20% Coyotes).
   */
  private pickRaidFaction(): RaiderFaction {
    const factions = Object.values(RaiderFaction);
    if (getTotalBankBalance() < BANK_RISK_THRESHOLD) {
      return factions[Phaser.Math.Between(0, factions.length - 1)];
    }
    const roll = Math.random();
    if (roll < 0.6) {
      return RaiderFaction.Outlaws;
    }
    return roll < 0.8 ? RaiderFaction.Rustlers : RaiderFaction.Coyotes;
  }

  private startRaid(): void {
    const faction = this.pickRaidFaction();
    const count = Phaser.Math.Between(RAID_MIN_UNITS, RAID_MAX_UNITS);

    this.raidActive = true;
    this.showRaidNotice(faction);
    for (let i = 0; i < count; i++) {
      this.spawnRaider(faction);
    }

    this.raidWaveTimer = this.time.delayedCall(RAID_WAVE_TIMEOUT_MS, () => this.endRaidWave());
  }

  private showRaidNotice(faction: RaiderFaction): void {
    this.raidNoticeText.setText(`${RAIDER_DEFINITIONS[faction].label} incoming!`);
    this.raidNoticeText.setVisible(true);
  }

  private hideRaidNotice(): void {
    this.raidNoticeText.setVisible(false);
  }

  private spawnRaider(faction: RaiderFaction): void {
    const spawn = this.pickRaidSpawnPoint();
    const definition = RAIDER_DEFINITIONS[faction];

    const image = this.add
      .image(spawn.x, spawn.y, RAIDERS_ATLAS_KEY, raiderTextureKey(faction))
      .setDepth(RAIDER_SPRITE_DEPTH);

    const raider: Raider = {
      image,
      faction,
      hp: definition.maxHp,
      targetBuildingId: null,
      arrived: false,
    };
    this.raiders.push(raider);
    this.updateRaiderTargeting(raider);
  }

  /** Random point along one of the 4 map edges, in world pixels; already within bounds by construction since each axis is drawn from [0, map-dimension-px]. */
  private pickRaidSpawnPoint(): { x: number; y: number } {
    const mapWidthPx = MAP_WIDTH_TILES * TILE_SIZE;
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE;
    const edge = Phaser.Math.Between(0, 3);

    switch (edge) {
      case 0:
        return { x: Phaser.Math.Between(0, mapWidthPx), y: 0 };
      case 1:
        return { x: mapWidthPx, y: Phaser.Math.Between(0, mapHeightPx) };
      case 2:
        return { x: Phaser.Math.Between(0, mapWidthPx), y: mapHeightPx };
      default:
        return { x: 0, y: Phaser.Math.Between(0, mapHeightPx) };
    }
  }

  /**
   * Only reassigns a target when the current one is missing/dead - a raider
   * commits to its target once and walks there a single time (per the phase
   * spec), it does not re-evaluate "nearest" on every leg like villagers do.
   * Called once at spawn (target starts null) and again each combat tick so
   * a raider whose target died (or that spawned with none, e.g. an empty
   * map) can pick up a newly-valid building without needing its own timer.
   */
  private updateRaiderTargeting(raider: Raider): void {
    const currentTarget = raider.targetBuildingId ? getBuildingById(raider.targetBuildingId) : null;
    if (currentTarget && currentTarget.hp > 0) {
      return;
    }

    const definition = RAIDER_DEFINITIONS[raider.faction];
    const next = this.pickRaiderTarget(definition, raider.image.x, raider.image.y);
    if (!next) {
      raider.targetBuildingId = null;
      raider.arrived = false;
      this.tweens.killTweensOf(raider.image);
      return;
    }

    raider.targetBuildingId = next.id;
    raider.arrived = false;
    this.sendRaiderToTarget(raider, next);
  }

  private pickRaiderTarget(definition: RaiderDefinition, x: number, y: number): PlacedBuilding | null {
    if (definition.targeting === 'farm-preferred') {
      const farm = this.findNearestBuilding(x, y, (building) => !!BUILDING_DEFINITIONS[building.type].animal);
      if (farm) {
        return farm;
      }
    }
    return this.findNearestBuilding(x, y, () => true);
  }

  private findNearestBuilding(
    x: number,
    y: number,
    predicate: (building: PlacedBuilding) => boolean,
  ): PlacedBuilding | null {
    let best: PlacedBuilding | null = null;
    let bestDistance = Infinity;

    for (const building of getPlacedBuildings()) {
      if (building.hp <= 0 || !predicate(building)) {
        continue;
      }
      const center = this.tileCenter(building);
      const distance = Phaser.Math.Distance.Between(x, y, center.x, center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }

    return best;
  }

  /** Single point-to-point tween, same walk-speed/duration technique as Phase 20's villagers - but with no onComplete chain back into another leg, since this raider's target never moves. */
  private sendRaiderToTarget(raider: Raider, target: PlacedBuilding): void {
    const definition = RAIDER_DEFINITIONS[raider.faction];
    const center = this.tileCenter(target);
    const distance = Phaser.Math.Distance.Between(raider.image.x, raider.image.y, center.x, center.y);
    const duration = (distance / definition.speedPxPerSec) * 1000;

    raider.image.setFlipX(center.x < raider.image.x);

    this.tweens.add({
      targets: raider.image,
      x: center.x,
      y: center.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        raider.arrived = true;
      },
    });
  }

  /** Runs on the same 2s cadence as production (see setupProductionTimer); no-op when nothing is on the map so an idle game costs nothing extra. */
  private runRaidCombatTick(): void {
    if (this.raiders.length === 0) {
      return;
    }

    for (const raider of this.raiders) {
      this.updateRaiderTargeting(raider);
    }
    this.resolveRaiderAttacks();
    this.resolveCowboyFire();
    this.removeDeadRaiders();
    this.redrawHpBars();
  }

  private resolveRaiderAttacks(): void {
    for (const raider of this.raiders) {
      if (!raider.arrived || !raider.targetBuildingId) {
        continue;
      }
      const target = getBuildingById(raider.targetBuildingId);
      if (!target || target.hp <= 0) {
        continue;
      }
      const definition = RAIDER_DEFINITIONS[raider.faction];
      target.hp = Math.max(0, target.hp - definition.damage);
    }
  }

  /**
   * Every living unit (Cowboy or Cowboy-on-Horse - this.cowboyUnits holds
   * both kinds, Phase 28) fires once per combat tick at its own nearest
   * in-range raider - not shared/coordinated targeting. Phase 24: reads each
   * unit's live image position instead of re-deriving a Barracks slot, so a
   * unit moved away from its training building still defends from where it
   * stands. Range/damage are shared across both kinds (only speed/HP differ,
   * per the phase spec), so no kind-branching is needed here.
   */
  private resolveCowboyFire(): void {
    const rangePx = COWBOY_RANGE_TILES * TILE_SIZE;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const position = { x: unit.image.x, y: unit.image.y };
      const target = this.findNearestRaider(position.x, position.y, rangePx);
      if (!target) {
        continue;
      }
      target.hp -= COWBOY_DAMAGE;
      this.spawnCowboyShotVisual(position, target.image);
    }
  }

  private findNearestRaider(x: number, y: number, maxDistance: number): Raider | null {
    let best: Raider | null = null;
    let bestDistance = maxDistance;

    for (const raider of this.raiders) {
      if (raider.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, raider.image.x, raider.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = raider;
      }
    }

    return best;
  }

  /** Cheap fire-and-forget visual: a plain line, faded and destroyed shortly after - no projectile-physics/travel-time simulation. */
  private spawnCowboyShotVisual(from: { x: number; y: number }, to: Phaser.GameObjects.Image): void {
    const line = this.add.graphics().setDepth(COWBOY_SHOT_DEPTH);
    line.lineStyle(2, COWBOY_SHOT_COLOR, 1);
    line.lineBetween(from.x, from.y, to.x, to.y);
    this.cowboyShotGraphics.push(line);

    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: COWBOY_SHOT_FADE_MS,
      onComplete: () => {
        line.destroy();
        const index = this.cowboyShotGraphics.indexOf(line);
        if (index >= 0) {
          this.cowboyShotGraphics.splice(index, 1);
        }
      },
    });
  }

  private removeDeadRaiders(): void {
    const survivors: Raider[] = [];
    for (const raider of this.raiders) {
      if (raider.hp > 0) {
        survivors.push(raider);
        continue;
      }
      this.tweens.killTweensOf(raider.image);
      raider.image.destroy();
    }
    this.raiders = survivors;

    if (this.raidActive && this.raiders.length === 0) {
      this.endRaidWave();
    }
  }

  /** Reached either when every raider in the wave is dead (removeDeadRaiders) or the wave timeout fires - whichever comes first. */
  private endRaidWave(): void {
    if (!this.raidActive) {
      return;
    }
    this.raidActive = false;
    this.raidWaveTimer?.remove();
    this.raidWaveTimer = null;
    this.hideRaidNotice();

    for (const raider of this.raiders) {
      this.tweens.killTweensOf(raider.image);
      raider.image.destroy();
    }
    this.raiders = [];
  }

  /**
   * Cancels the pending raid-check timer entirely (rather than letting it
   * fire on stale timing) and starts a fresh one with a new random delay, so
   * a just-reset game doesn't inherit a countdown from the previous run.
   */
  private resetRaidState(): void {
    this.raidWaveTimer?.remove();
    this.raidWaveTimer = null;
    this.raidCheckTimer?.remove();
    this.raidCheckTimer = null;

    for (const raider of this.raiders) {
      this.tweens.killTweensOf(raider.image);
      raider.image.destroy();
    }
    this.raiders = [];

    for (const shot of this.cowboyShotGraphics) {
      this.tweens.killTweensOf(shot);
      shot.destroy();
    }
    this.cowboyShotGraphics = [];

    this.raidActive = false;
    this.hideRaidNotice();

    this.scheduleNextRaidCheck();
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): { tileX: number; tileY: number } {
    return {
      tileX: Math.floor(pointer.worldX / TILE_SIZE),
      tileY: Math.floor(pointer.worldY / TILE_SIZE),
    };
  }
}
