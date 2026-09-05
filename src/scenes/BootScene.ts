import Phaser from 'phaser';
import { TILE_SIZE } from '../config/gameConfig';

export const TILESET_KEY = 'tiles-atlas';

const TILE_COLORS = [0x4caf50, 0x2196f3, 0xffeb3b];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.generateTilesetTexture();
  }

  create(): void {
    this.scene.start('MainScene');
  }

  private generateTilesetTexture(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });

    TILE_COLORS.forEach((color, index) => {
      graphics.fillStyle(color, 1);
      graphics.fillRect(index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    });

    graphics.generateTexture(TILESET_KEY, TILE_COLORS.length * TILE_SIZE, TILE_SIZE);
    graphics.destroy();
  }
}
