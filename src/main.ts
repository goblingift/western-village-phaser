import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { BuildingBar } from './ui/BuildingBar';
import { BuildingInfoPanel } from './ui/BuildingInfoPanel';
import { GameOverOverlay } from './ui/GameOverOverlay';

new Phaser.Game(gameConfig);

const appContainer = document.getElementById('app');
// The info panel is an in-game overlay, so it lives inside the canvas's
// positioned wrapper (#stage); the bar and the game-over screen are chrome
// around the play area and stay on #app.
const stageContainer = document.getElementById('stage');
if (appContainer && stageContainer) {
  new BuildingBar(appContainer);
  new BuildingInfoPanel(stageContainer);
  new GameOverOverlay(appContainer);
}
