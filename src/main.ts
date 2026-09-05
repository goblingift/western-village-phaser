import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { BuildingBar } from './ui/BuildingBar';
import { BuildingInfoPanel } from './ui/BuildingInfoPanel';
import { GameOverOverlay } from './ui/GameOverOverlay';

new Phaser.Game(gameConfig);

const appContainer = document.getElementById('app');
if (appContainer) {
  new BuildingBar(appContainer);
  new BuildingInfoPanel(appContainer);
  new GameOverOverlay(appContainer);
}
