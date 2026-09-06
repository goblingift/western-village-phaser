import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MainScene } from '../scenes/MainScene';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './constants';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'stage',
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  backgroundColor: '#2d2d2d',
  scene: [BootScene, MainScene],
  scale: {
    mode: Phaser.Scale.NONE,
  },
};
