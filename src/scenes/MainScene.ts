import Phaser from 'phaser';
import {
  GAME_DURATION_SECONDS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MINIMAP_HEIGHT,
  MINIMAP_MARGIN,
  MINIMAP_WIDTH,
  POPULATION_PER_HOUSE,
  PRODUCTION_TICK_MS,
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
  PlacedBuilding,
  VILLAGERS_ATLAS_KEY,
  VILLAGER_TEXTURE_KEY,
  accentTextureKey,
  animalTextureKey,
  buildingTextureKey,
} from '../config/buildingConfig';
import { playPlacementSound } from '../audio/sound';
import { gameEvents } from '../state/gameEvents';
import {
  canPlaceBuilding,
  getBuildingAtTile,
  getEmployedPopulation,
  getFenceLinks,
  getMoney,
  getPlacedBuildings,
  getResources,
  getStorageCap,
  getTotalMeatProduced,
  getTotalPopulation,
  placeBuilding,
  runProductionTick,
  tickTimer,
} from '../state/gameState';

const FENCE_LINE_COLOR = 0x8d6748;

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

interface BuildingVisual {
  building: PlacedBuilding;
  image: Phaser.GameObjects.Image;
  animalImages: Phaser.GameObjects.Image[];
  accentObjects: Phaser.GameObjects.GameObject[];
  cowboyImages: Phaser.GameObjects.Image[];
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
    this.setupHpBarVisuals();
    this.setupGameReset();
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

      if (pointer.isDown && this.selectedType === null) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
        this.redrawMinimapViewportThrottled();
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

      this.minimapPointerActive = this.isPointerInMinimap(pointer);
      if (this.minimapPointerActive) {
        this.navigateMinimapTo(pointer);
      }
    });
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
    const { rawMeat, meat, water, eggs } = getResources();
    const fmt = (n: number) => Math.round(n * 10) / 10;
    return (
      `Money: $${fmt(getMoney())} | Raw Meat: ${fmt(rawMeat)} | Meat: ${fmt(meat)} | Water: ${fmt(water)} | Eggs: ${fmt(eggs)}\n` +
      `Population: ${getEmployedPopulation()}/${getTotalPopulation()} | Storage cap: ${getStorageCap()}`
    );
  }

  private setupProductionTimer(): void {
    this.time.addEvent({
      delay: PRODUCTION_TICK_MS,
      loop: true,
      callback: () => runProductionTick(),
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

    const visual: BuildingVisual = { building, image, animalImages: [], accentObjects: [], cowboyImages: [] };
    this.buildingVisuals.set(building.id, visual);
    if (building.type === BuildingType.Fence) {
      // connections-updated already fired before this building's visual existed; redraw now that it does.
      this.redrawFenceLines();
    }
    this.redrawAnimalSprites(visual);
    this.redrawCowboySprites(visual);
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
      const visual = this.buildingVisuals.get(building.id);
      if (visual) {
        this.redrawCowboySprites(visual);
      }
    });
  }

  /**
   * Only called on placement and 'cowboy-trained' (i.e. when cowboyCount
   * actually changes), same rule as redrawAnimalSprites. Unlike animals,
   * Cowboys never wander - they're garrisoned defenders that hold a fixed
   * slot, so no tween is started here.
   */
  private redrawCowboySprites(visual: BuildingVisual): void {
    for (const cowboyImage of visual.cowboyImages) {
      cowboyImage.destroy();
    }
    visual.cowboyImages = [];

    if (visual.building.type !== BuildingType.Barracks) {
      return;
    }

    for (let index = 0; index < visual.building.cowboyCount; index++) {
      const slot = this.getCowboySlotPosition(visual.building, index);
      const cowboyImage = this.add
        .image(slot.x, slot.y, COWBOYS_ATLAS_KEY, COWBOY_TEXTURE_KEY)
        .setDepth(COWBOY_SPRITE_DEPTH);
      visual.cowboyImages.push(cowboyImage);
    }
  }

  /** Same deterministic row/column slot layout as getAnimalSlotPosition, kept separate since Cowboys are a distinct asset class from animals. */
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

      for (const { image, animalImages, accentObjects, cowboyImages } of this.buildingVisuals.values()) {
        image.destroy();
        for (const animalImage of animalImages) {
          this.tweens.killTweensOf(animalImage);
          animalImage.destroy();
        }
        for (const accentObject of accentObjects) {
          this.tweens.killTweensOf(accentObject);
          accentObject.destroy();
        }
        for (const cowboyImage of cowboyImages) {
          cowboyImage.destroy();
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
    });
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): { tileX: number; tileY: number } {
    return {
      tileX: Math.floor(pointer.worldX / TILE_SIZE),
      tileY: Math.floor(pointer.worldY / TILE_SIZE),
    };
  }
}
