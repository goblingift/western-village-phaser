import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import { BUILDING_ATLAS_KEY, BUILDING_DEFINITIONS, buildingTextureKey } from '../config/buildingConfig';

export const TILESET_KEY = 'tiles-atlas';

const TILE_COLORS = [0x4caf50, 0x2196f3, 0xd2b48c];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.generateTilesetTexture();
    this.generateBuildingAtlas();
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

  private generateBuildingAtlas(): void {
    const definitions = Object.values(BUILDING_DEFINITIONS);
    const layout = definitions.map((definition) => ({
      definition,
      width: definition.size.width * TILE_SIZE,
      height: definition.size.height * TILE_SIZE,
    }));

    let atlasWidth = 0;
    let atlasHeight = 0;
    const positions: number[] = [];
    for (const { width, height } of layout) {
      positions.push(atlasWidth);
      atlasWidth += width;
      atlasHeight = Math.max(atlasHeight, height);
    }

    const graphics = this.make.graphics({ x: 0, y: 0 });
    layout.forEach(({ definition, width, height }, index) => {
      const x = positions[index];
      graphics.fillStyle(definition.color, 1);
      graphics.fillRect(x, 0, width, height);
      graphics.lineStyle(2, 0x000000, 0.4);
      graphics.strokeRect(x + 1, 1, width - 2, height - 2);
    });

    graphics.generateTexture(BUILDING_ATLAS_KEY, atlasWidth, atlasHeight);
    graphics.destroy();

    const texture = this.textures.get(BUILDING_ATLAS_KEY);
    layout.forEach(({ definition, width, height }, index) => {
      texture.add(buildingTextureKey(definition.type), 0, positions[index], 0, width, height);
    });
  }
}
