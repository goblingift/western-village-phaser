import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MainScene } from '../scenes/MainScene';

export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 30;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: MAP_WIDTH_TILES * TILE_SIZE,
  height: MAP_HEIGHT_TILES * TILE_SIZE,
  backgroundColor: '#2d2d2d',
  scene: [BootScene, MainScene],
  scale: {
    mode: Phaser.Scale.NONE,
  },
};
