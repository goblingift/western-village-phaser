import Phaser from 'phaser';
import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES, TILE_SIZE } from '../config/gameConfig';
import { generateTileMap } from '../config/mapConfig';
import { TILESET_KEY } from './BootScene';

export class MainScene extends Phaser.Scene {
  private infoText!: Phaser.GameObjects.Text;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.buildTilemap();
    this.setupCameraDrag();
    this.setupInfoText();
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
      if (pointer.isDown) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
      }
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.updateInfoText(pointer);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
    });
  }

  private setupInfoText(): void {
    this.infoText = this.add.text(8, 8, 'tile: -, -', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    });
    this.infoText.setScrollFactor(0);
    this.infoText.setDepth(1000);
  }

  private updateInfoText(pointer: Phaser.Input.Pointer): void {
    const tileX = Math.floor(pointer.worldX / TILE_SIZE);
    const tileY = Math.floor(pointer.worldY / TILE_SIZE);
    this.infoText.setText(`tile: ${tileX}, ${tileY}`);
  }
}
