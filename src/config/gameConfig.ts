import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MainScene } from '../scenes/MainScene';

export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 30;
export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 640;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  backgroundColor: '#2d2d2d',
  scene: [BootScene, MainScene],
  scale: {
    mode: Phaser.Scale.NONE,
  },
};
