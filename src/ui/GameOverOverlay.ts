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

  /**
   * Phase 32: scored on net worth rather than meat alone, with the breakdown
   * shown so the player can see which strategy actually paid - cash hoarding,
   * banking, stockpiling goods, or building out the town. Buildings the
   * player never built are omitted from the counts list, which used to print
   * every type at zero.
   */
  private show(summary: GameOverSummary): void {
    const buildingRows = Object.values(BuildingType)
      .filter((type) => summary.buildingCounts[type] > 0)
      .map((type) => `<div>${BUILDING_DEFINITIONS[type].label}: ${summary.buildingCounts[type]}</div>`)
      .join('');

    const { netWorth } = summary;

    this.content.innerHTML = `
      <h2>Time's Up!</h2>
      <div class="stat">Net worth: $${netWorth.total}</div>
      <h3>Breakdown</h3>
      <div>Cash: $${netWorth.cash}</div>
      <div>Banked: $${netWorth.banked}</div>
      <div>Resource stock: $${netWorth.resources}</div>
      <div>Buildings standing: $${netWorth.buildings}</div>
      <div>Meat produced: ${summary.totalMeatProduced}</div>
      <h3>Buildings Built</h3>
      ${buildingRows || '<div>None</div>'}
      <button id="play-again-button">Play Again</button>
    `;

    this.content.querySelector('#play-again-button')?.addEventListener('click', () => {
      this.overlay.hidden = true;
      resetGame();
    });

    this.overlay.hidden = false;
  }
}
