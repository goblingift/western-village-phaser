import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { BuildingBar } from './ui/BuildingBar';
import { BuildingInfoPanel } from './ui/BuildingInfoPanel';
import { DifficultySelectOverlay } from './ui/DifficultySelectOverlay';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { NotificationLogPanel } from './ui/NotificationLogPanel';
import { StatisticsPanel } from './ui/StatisticsPanel';

new Phaser.Game(gameConfig);

const appContainer = document.getElementById('app');
// The info panel is an in-game overlay, so it lives inside the canvas's
// positioned wrapper (#stage); the bar and the game-over/difficulty-select
// screens are chrome around the play area and stay on #app.
const stageContainer = document.getElementById('stage');
if (appContainer && stageContainer) {
  new BuildingBar(appContainer);
  new BuildingInfoPanel(stageContainer);
  new NotificationLogPanel(stageContainer);
  new StatisticsPanel(stageContainer);
  new GameOverOverlay(appContainer);
  // Phase 39: shown last so it's on top for the very first run; MainScene
  // itself starts paused (see MainScene.pauseForPreGameSelection) until this
  // overlay's Start button calls resetGame with the chosen mode/difficulty.
  new DifficultySelectOverlay(appContainer);
}
