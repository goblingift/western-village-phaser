import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import { BUILDING_DEFINITIONS, buildingTextureKey } from '../config/buildingConfig';

export const TILESET_KEY = 'tiles-atlas';

const TILE_COLORS = [0x4caf50, 0x2196f3, 0xffeb3b];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.generateTilesetTexture();
    this.generateBuildingTextures();
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

  private generateBuildingTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });

    for (const definition of Object.values(BUILDING_DEFINITIONS)) {
      const width = definition.size.width * TILE_SIZE;
      const height = definition.size.height * TILE_SIZE;

      graphics.clear();
      graphics.fillStyle(definition.color, 1);
      graphics.fillRect(0, 0, width, height);
      graphics.lineStyle(2, 0x000000, 0.4);
      graphics.strokeRect(1, 1, width - 2, height - 2);
      graphics.generateTexture(buildingTextureKey(definition.type), width, height);
    }

    graphics.destroy();
  }
}
