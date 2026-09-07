import Phaser from 'phaser';
import { VIEWPORT_HEIGHT } from './config/constants';
import { gameConfig } from './config/gameConfig';
import { BuildingBar } from './ui/BuildingBar';
import { BuildingInfoPanel } from './ui/BuildingInfoPanel';
import { DifficultySelectOverlay } from './ui/DifficultySelectOverlay';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { HelpOverlay } from './ui/HelpOverlay';
import { NotificationLogPanel } from './ui/NotificationLogPanel';
import { ObjectivesPanel } from './ui/ObjectivesPanel';
import { StatisticsPanel } from './ui/StatisticsPanel';
import { TutorialOverlay } from './ui/TutorialOverlay';

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
  new ObjectivesPanel(stageContainer);
  // Phase 64: the tutorial is a card docked over the play area, so it lives in
  // #stage with the other in-game overlays; the help panel is a full-screen
  // modal like the game-over/difficulty screens, so it belongs on #app.
  new TutorialOverlay(stageContainer);
  new HelpOverlay(appContainer);
  new GameOverOverlay(appContainer);
  // Phase 39: shown last so it's on top for the very first run; MainScene
  // itself starts paused (see MainScene.pauseForPreGameSelection) until this
  // overlay's Start button calls resetGame with the chosen mode/difficulty.
  new DifficultySelectOverlay(appContainer);

  /**
   * Phase 65: keep `--stage-max-h` (the canvas's max-height, see index.html)
   * equal to the viewport height minus whatever the building bar currently
   * occupies. The bar's height is genuinely dynamic - it depends on the
   * selected category's button count, on wrapping at narrow widths, and on the
   * coarse-pointer touch-target rules - so a hardcoded vh value would either
   * clip the bar or waste play area. A percentage max-height on the canvas
   * cannot express this at all, because #stage is now content-sized by the
   * canvas itself and the constraint would be circular.
   */
  const barElement = appContainer.querySelector<HTMLElement>('#building-bar');
  if (barElement) {
    const applyStageMaxHeight = (): void => {
      // Never above the native VIEWPORT_HEIGHT: FIT is only ever meant to
      // scale the canvas DOWN to fit a small window, never to upscale a
      // pixel-art game past 1:1 on a large one.
      const available = Math.min(
        VIEWPORT_HEIGHT,
        window.innerHeight - barElement.offsetHeight,
      );
      document.documentElement.style.setProperty('--stage-max-h', `${Math.max(0, available)}px`);
    };
    /**
     * Deferred to the next frame on purpose. A `resize` listener runs before
     * the browser has re-laid-out the bar, so reading offsetHeight inline
     * measures the PREVIOUS layout. That made the cap ratchet permanently
     * downwards: shrinking the window shrank the canvas, but growing it back
     * re-applied a stale (too small) cap, so the canvas stayed stuck at its
     * smallest-ever size for the rest of the session.
     */
    const syncStageMaxHeight = (): void => {
      requestAnimationFrame(applyStageMaxHeight);
    };
    new ResizeObserver(syncStageMaxHeight).observe(barElement);
    window.addEventListener('resize', syncStageMaxHeight);
    applyStageMaxHeight();
  }
}
