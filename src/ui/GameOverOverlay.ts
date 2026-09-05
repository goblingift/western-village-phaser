import { BUILDING_DEFINITIONS, BuildingType } from '../config/buildingConfig';
import { GameOverSummary, resetGame } from '../state/gameState';
import { gameEvents } from '../state/gameEvents';

export class GameOverOverlay {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'game-over-overlay';
    this.overlay.hidden = true;

    this.content = document.createElement('div');
    this.content.id = 'game-over-panel';
    this.overlay.appendChild(this.content);

    container.appendChild(this.overlay);

    gameEvents.on('game-over', (summary: GameOverSummary) => this.show(summary));
  }

  private show(summary: GameOverSummary): void {
    const buildingRows = Object.values(BuildingType)
      .map((type) => `<div>${BUILDING_DEFINITIONS[type].label}: ${summary.buildingCounts[type]}</div>`)
      .join('');

    this.content.innerHTML = `
      <h2>Time's Up!</h2>
      <div class="stat">Meat produced: ${summary.totalMeatProduced}</div>
      <h3>Buildings Built</h3>
      ${buildingRows}
      <button id="play-again-button">Play Again</button>
    `;

    this.content.querySelector('#play-again-button')?.addEventListener('click', () => {
      this.overlay.hidden = true;
      resetGame();
    });

    this.overlay.hidden = false;
  }
}
