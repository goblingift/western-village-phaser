import { Difficulty, DIFFICULTY_SETTINGS, RunMode } from '../config/constants';
import { resetGame } from '../state/gameState';
import { gameEvents } from '../state/gameEvents';
import { getMostRecentSaveSlotName, loadFromSlot } from '../state/persistence';
import { RunRecord, formatDuration, getAllRecords, recordKey } from '../state/records';

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

/** Phase 65: Endless is the recommended primary mode; Fixed is demoted to a secondary short option, but stays fully intact and selectable. */
const MODE_LABELS: Record<RunMode, string> = {
  endless: 'Endless (Recommended)',
  fixed: '3 Days (Short)',
};

const MODE_DESCRIPTIONS: Record<RunMode, string> = {
  endless: 'The day/night cycle repeats forever - only losing every building ends the run. Recommended.',
  fixed: 'A short run: the buzzer ends it after 3 full day/night cycles.',
};

/** Display/selection order for the mode buttons - Endless listed first now that it's the default. */
const MODE_ORDER: RunMode[] = ['endless', 'fixed'];

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
  private selectedMode: RunMode = 'endless';

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'difficulty-select-overlay';

    this.content = document.createElement('div');
    this.content.id = 'difficulty-select-panel';
    this.overlay.appendChild(this.content);

    container.appendChild(this.overlay);

    this.render();

    gameEvents.on('request-run-restart', () => {
      // Phase 52: re-render rather than just un-hiding - a save may have been
      // made (manually, or via autosave) since this overlay's HTML was last
      // built, and the "Continue" button's presence depends on that.
      this.render();
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

    const modeButtons = MODE_ORDER
      .map((mode) => {
        const active = mode === this.selectedMode ? ' active' : '';
        return `<button type="button" class="option-button mode-option${active}" data-mode="${mode}">${MODE_LABELS[mode]}</button>`;
      })
      .join('');

    // Phase 52: "Continue" only appears when a save (manual or autosave)
    // actually exists - loads whichever of the two slots is most recent,
    // skipping the difficulty/mode pick entirely (the save already carries
    // its own).
    const mostRecentSlot = getMostRecentSaveSlotName();
    const continueButton = mostRecentSlot
      ? `<button id="continue-run-button">Continue</button>`
      : '';

    this.content.innerHTML = `
      <h2>Western Village</h2>
      ${continueButton}
      <h3>Difficulty</h3>
      <div class="option-row">${difficultyButtons}</div>
      <div class="stat">${DIFFICULTY_DESCRIPTIONS[this.selectedDifficulty]}</div>
      <h3>Run Length</h3>
      <div class="option-row">${modeButtons}</div>
      <div class="stat">${MODE_DESCRIPTIONS[this.selectedMode]}</div>
      ${this.renderRecordsSection()}
      <button id="start-run-button">Start New Game</button>
    `;

    this.attachHandlers(mostRecentSlot);
  }

  /**
   * Phase 64: shows what the player is chasing BEFORE the run starts. The
   * currently-selected difficulty+mode is called out in full (it re-renders on
   * every option click, so it always describes the combo about to be played),
   * with the remaining combos listed compactly underneath for context. Combos
   * never played are omitted entirely rather than listed as rows of zeroes.
   */
  private renderRecordsSection(): string {
    const all = getAllRecords();
    const selectedKey = recordKey(this.selectedDifficulty, this.selectedMode);
    const selected: RunRecord | undefined = all[selectedKey];

    const selectedBlock = selected
      ? `<div class="stat">Best here: $${selected.bestNetWorth} &middot; ${formatDuration(
          selected.longestSurvivalSeconds,
        )} &middot; day ${selected.mostDaysSurvived}</div>`
      : '<div class="stat">No record yet on these settings.</div>';

    const others = Object.entries(all)
      .filter(([key]) => key !== selectedKey)
      .map(([key, record]) => {
        const [difficulty, mode] = key.split(':') as [Difficulty, RunMode];
        const label = `${DIFFICULTY_LABELS[difficulty] ?? difficulty} / ${MODE_LABELS[mode] ?? mode}`;
        return `<div class="record-row">${label}: $${record.bestNetWorth} &middot; day ${record.mostDaysSurvived}</div>`;
      })
      .join('');

    return `
      <h3>Records</h3>
      ${selectedBlock}
      ${others}
    `;
  }

  private attachHandlers(mostRecentSlot: string | null): void {
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
    this.content.querySelector('#continue-run-button')?.addEventListener('click', () => {
      if (!mostRecentSlot) {
        return;
      }
      this.overlay.hidden = true;
      loadFromSlot(mostRecentSlot);
    });
    this.content.querySelector('#start-run-button')?.addEventListener('click', () => {
      this.overlay.hidden = true;
      resetGame({ mode: this.selectedMode, difficulty: this.selectedDifficulty });
    });
  }
}
