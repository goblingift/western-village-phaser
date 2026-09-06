import { Difficulty, DIFFICULTY_SETTINGS, RunMode } from '../config/constants';
import { resetGame } from '../state/gameState';
import { gameEvents } from '../state/gameEvents';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  easy: 'More starting cash, cheaper upkeep, slower raid escalation.',
  normal: 'The baseline experience.',
  hard: 'Less starting cash, pricier upkeep, faster and harder raids.',
};

const MODE_LABELS: Record<RunMode, string> = {
  fixed: '3 Days',
  endless: 'Endless',
};

const MODE_DESCRIPTIONS: Record<RunMode, string> = {
  fixed: 'The run ends at the buzzer after 3 full day/night cycles.',
  endless: 'The day/night cycle repeats forever - only losing every building ends the run.',
};

/**
 * Phase 39: shown before MainScene's world starts advancing (see
 * MainScene.pauseForPreGameSelection, which freezes time/tween scale to 0
 * immediately on create) and again whenever GameOverOverlay's Play Again
 * button fires 'request-run-restart', so a new run never silently reuses the
 * previous one's difficulty/mode. Visible from construction - unlike
 * GameOverOverlay, there is no "hidden by default" state, since the very
 * first run also has to wait behind this screen.
 */
export class DifficultySelectOverlay {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private selectedDifficulty: Difficulty = 'normal';
  private selectedMode: RunMode = 'fixed';

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'difficulty-select-overlay';

    this.content = document.createElement('div');
    this.content.id = 'difficulty-select-panel';
    this.overlay.appendChild(this.content);

    container.appendChild(this.overlay);

    this.render();

    gameEvents.on('request-run-restart', () => {
      this.overlay.hidden = false;
    });
  }

  private render(): void {
    const difficultyButtons = (Object.keys(DIFFICULTY_SETTINGS) as Difficulty[])
      .map((difficulty) => {
        const active = difficulty === this.selectedDifficulty ? ' active' : '';
        return `<button type="button" class="option-button difficulty-option${active}" data-difficulty="${difficulty}">${DIFFICULTY_LABELS[difficulty]}</button>`;
      })
      .join('');

    const modeButtons = (['fixed', 'endless'] as RunMode[])
      .map((mode) => {
        const active = mode === this.selectedMode ? ' active' : '';
        return `<button type="button" class="option-button mode-option${active}" data-mode="${mode}">${MODE_LABELS[mode]}</button>`;
      })
      .join('');

    this.content.innerHTML = `
      <h2>Western Village</h2>
      <h3>Difficulty</h3>
      <div class="option-row">${difficultyButtons}</div>
      <div class="stat">${DIFFICULTY_DESCRIPTIONS[this.selectedDifficulty]}</div>
      <h3>Run Length</h3>
      <div class="option-row">${modeButtons}</div>
      <div class="stat">${MODE_DESCRIPTIONS[this.selectedMode]}</div>
      <button id="start-run-button">Start</button>
    `;

    this.content.querySelectorAll<HTMLButtonElement>('.difficulty-option').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedDifficulty = button.dataset.difficulty as Difficulty;
        this.render();
      });
    });
    this.content.querySelectorAll<HTMLButtonElement>('.mode-option').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedMode = button.dataset.mode as RunMode;
        this.render();
      });
    });
    this.content.querySelector('#start-run-button')?.addEventListener('click', () => {
      this.overlay.hidden = true;
      resetGame({ mode: this.selectedMode, difficulty: this.selectedDifficulty });
    });
  }
}
