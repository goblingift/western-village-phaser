import Phaser from 'phaser';
import { TILE_SIZE } from '../config/gameConfig';

interface PlaceholderTile {
  key: string;
  color: number;
}

const PLACEHOLDER_TILES: PlaceholderTile[] = [
  { key: 'tile-grass', color: 0x4caf50 },
  { key: 'tile-water', color: 0x2196f3 },
  { key: 'tile-sand', color: 0xd7c48a },
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.generatePlaceholderTextures();
  }

  create(): void {
    this.scene.start('MainScene');
  }

  private generatePlaceholderTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });

    for (const tile of PLACEHOLDER_TILES) {
      graphics.clear();
      graphics.fillStyle(tile.color, 1);
      graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      graphics.generateTexture(tile.key, TILE_SIZE, TILE_SIZE);
    }

    graphics.destroy();
  }
}
