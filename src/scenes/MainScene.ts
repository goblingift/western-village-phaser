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
import {
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingType,
  PlacedBuilding,
  buildingTextureKey,
} from '../config/buildingConfig';
import { playCollectSound, playPlacementSound } from '../audio/sound';
import { gameEvents } from '../state/gameEvents';
import {
  canPlaceBuilding,
  collectBuilding,
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
  readyIndicator: Phaser.GameObjects.Text;
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
  private connectionGraphics!: Phaser.GameObjects.Graphics;
  private lastInfoTileX: number | null = null;
  private lastInfoTileY: number | null = null;

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
    this.setupHarvestIndicators();
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
      const building = getBuildingAtTile(tileX, tileY);

      if (building) {
        const collected = collectBuilding(building.id);
        if (collected) {
          this.buildingVisuals.get(building.id)?.readyIndicator.setVisible(false);
          playCollectSound();
        }
      }

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

    const readyIndicator = this.createReadyIndicator(building);

    this.buildingVisuals.set(building.id, { building, image, readyIndicator });
    playPlacementSound();
  }

  private createReadyIndicator(building: PlacedBuilding): Phaser.GameObjects.Text {
    const { width } = BUILDING_DEFINITIONS[building.type].size;
    const centerX = building.tileX * TILE_SIZE + (width * TILE_SIZE) / 2;
    const topY = building.tileY * TILE_SIZE;

    const indicator = this.add
      .text(centerX, topY - 4, '$', {
        fontSize: '18px',
        color: '#ffee58',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setDepth(30)
      .setVisible(false);

    this.tweens.add({
      targets: indicator,
      y: topY - 10,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return indicator;
  }

  private setupHarvestIndicators(): void {
    gameEvents.on('production-tick', () => this.refreshReadyIndicators());
  }

  private refreshReadyIndicators(): void {
    for (const { building, readyIndicator } of this.buildingVisuals.values()) {
      readyIndicator.setVisible(building.ready);
    }
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

  private setupGameReset(): void {
    gameEvents.on('game-reset', () => {
      this.cancelPlacement();
      gameEvents.emit('building-selected', null);

      for (const { image, readyIndicator } of this.buildingVisuals.values()) {
        image.destroy();
        readyIndicator.destroy();
      }
      this.buildingVisuals.clear();
      this.connectionGraphics.clear();
    });
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): { tileX: number; tileY: number } {
    return {
      tileX: Math.floor(pointer.worldX / TILE_SIZE),
      tileY: Math.floor(pointer.worldY / TILE_SIZE),
    };
  }
}
