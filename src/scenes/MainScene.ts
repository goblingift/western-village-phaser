import Phaser from 'phaser';
import {
  GAME_DURATION_SECONDS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  PRODUCTION_TICK_MS,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../config/constants';
import { generateTileMap } from '../config/mapConfig';
import { TILESET_KEY } from './BootScene';
import { BUILDING_DEFINITIONS, BuildingType, PlacedBuilding, buildingTextureKey } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';
import {
  canPlaceBuilding,
  getBuildingAtTile,
  getMoney,
  getResources,
  getTotalMeatProduced,
  placeBuilding,
  runProductionTick,
  tickTimer,
} from '../state/gameState';

const VALID_TINT = 0x00ff00;
const INVALID_TINT = 0xff0000;
const CLICK_MOVE_THRESHOLD = 6;

interface BuildingVisual {
  building: PlacedBuilding;
  image: Phaser.GameObjects.Image;
  border: Phaser.GameObjects.Graphics | null;
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

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.buildTilemap();
    this.setupCameraDrag();
    this.setupInfoText();
    this.setupResourceHud();
    this.setupTimerHud();
    this.setupBuildingPlacement();
    this.setupBuildingSelection();
    this.setupProductionTimer();
    this.setupConnectionVisuals();
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
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        layer.putTileAt(tileData[y][x], x, y);
      }
    }

    this.cameras.main.setBounds(0, 0, MAP_WIDTH_TILES * TILE_SIZE, MAP_HEIGHT_TILES * TILE_SIZE);
  }

  private setupCameraDrag(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && this.selectedType === null) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
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
    });
  }

  private setupInfoText(): void {
    this.infoText = this.add.text(8, VIEWPORT_HEIGHT - 8, 'tile: -, -', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    });
    this.infoText.setOrigin(0, 1);
    this.infoText.setScrollFactor(0);
    this.infoText.setDepth(1000);
  }

  private updateInfoText(pointer: Phaser.Input.Pointer): void {
    const { tileX, tileY } = this.pointerToTile(pointer);
    this.infoText.setText(`tile: ${tileX}, ${tileY}`);
  }

  private setupResourceHud(): void {
    this.resourceText = this.add.text(8, 8, this.formatResourceText(), {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    });
    this.resourceText.setScrollFactor(0);
    this.resourceText.setDepth(1000);

    gameEvents.on('money-changed', () => this.resourceText.setText(this.formatResourceText()));
    gameEvents.on('resources-changed', () => this.resourceText.setText(this.formatResourceText()));
  }

  private formatResourceText(): string {
    const { rawMeat, meat, water } = getResources();
    const fmt = (n: number) => Math.round(n * 10) / 10;
    return `Money: $${getMoney()} | Raw Meat: ${fmt(rawMeat)} | Meat: ${fmt(meat)} | Water: ${fmt(water)}`;
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
      backgroundColor: '#000000aa',
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
      if (this.selectedType !== null) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_THRESHOLD) {
        return;
      }

      const { tileX, tileY } = this.pointerToTile(pointer);
      gameEvents.emit('building-selected', getBuildingAtTile(tileX, tileY));
    });
  }

  private refreshPreviewTexture(): void {
    if (this.selectedType === null) {
      return;
    }

    this.previewImage?.destroy();
    this.previewImage = this.add.image(0, 0, buildingTextureKey(this.selectedType));
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
      .image(building.tileX * TILE_SIZE, building.tileY * TILE_SIZE, buildingTextureKey(building.type))
      .setOrigin(0, 0)
      .setDepth(10);

    const border = building.type !== BuildingType.Road ? this.createConnectionBorder(building) : null;

    this.buildingVisuals.set(building.id, { building, image, border });
  }

  private setupConnectionVisuals(): void {
    gameEvents.on('connections-updated', () => {
      for (const { building, border } of this.buildingVisuals.values()) {
        border?.setVisible(building.connected);
      }
    });
  }

  private setupGameReset(): void {
    gameEvents.on('game-reset', () => {
      this.cancelPlacement();
      gameEvents.emit('building-selected', null);

      for (const { image, border } of this.buildingVisuals.values()) {
        image.destroy();
        border?.destroy();
      }
      this.buildingVisuals.clear();
    });
  }

  private createConnectionBorder(building: PlacedBuilding): Phaser.GameObjects.Graphics {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const pixelWidth = width * TILE_SIZE;
    const pixelHeight = height * TILE_SIZE;

    const border = this.add.graphics();
    border.lineStyle(3, 0x00ff00, 1);
    border.strokeRect(1, 1, pixelWidth - 2, pixelHeight - 2);
    border.setPosition(building.tileX * TILE_SIZE, building.tileY * TILE_SIZE);
    border.setDepth(20);
    border.setVisible(building.connected);

    return border;
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): { tileX: number; tileY: number } {
    return {
      tileX: Math.floor(pointer.worldX / TILE_SIZE),
      tileY: Math.floor(pointer.worldY / TILE_SIZE),
    };
  }
}
