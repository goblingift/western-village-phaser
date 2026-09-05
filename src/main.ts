import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { BuildingBar } from './ui/BuildingBar';

new Phaser.Game(gameConfig);

const appContainer = document.getElementById('app');
if (appContainer) {
  new BuildingBar(appContainer);
}
