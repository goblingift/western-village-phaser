import { BUILDING_DEFINITIONS, BuildingType } from '../config/buildingConfig';
import { TOWN_RANK_LABELS } from '../config/townRank';
import { GameOverSummary } from '../state/gameState';
import { gameEvents } from '../state/gameEvents';
import { getLegacyPoints } from '../state/prestige';
import { RecordComparison, RunRecord, formatDuration, getRecord, submitRunResult } from '../state/records';

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

    // Phase 34: two ways a run can end now - the buzzer after three full
    // day/night cycles, or losing every last building to a raid. The score
    // breakdown is identical either way (a levelled town simply scores its
    // remaining cash and stock); only the headline changes.
    const destroyed = summary.reason === 'destroyed';
    const heading = destroyed ? 'Town Destroyed!' : "Time's Up!";
    const subheading = destroyed
      ? `<div class="stat">Raiders levelled the last building on day ${summary.daysSurvived}.</div>`
      : `<div class="stat">Survived all ${summary.daysSurvived} days.</div>`;

    // Phase 64: read the PREVIOUS best before submitting, otherwise the run
    // being scored would already have overwritten the number it's meant to be
    // compared against and nothing would ever look like a new record.
    const previousBest = getRecord(summary.difficulty, summary.mode);
    const comparison = submitRunResult({
      difficulty: summary.difficulty,
      mode: summary.mode,
      netWorth: netWorth.total,
      elapsedSeconds: summary.elapsedSeconds,
      daysSurvived: summary.daysSurvived,
      reason: summary.reason,
    });

    this.content.innerHTML = `
      <h2>${heading}</h2>
      ${subheading}
      <div class="stat">Town rank: ${TOWN_RANK_LABELS[summary.townRank]}</div>
      <div class="stat">Legacy earned: +${summary.legacyEarned} (Total: ${getLegacyPoints()})</div>
      <div class="stat">Net worth: $${netWorth.total}${this.newBestTag(comparison.netWorth)}</div>
      <div class="stat">Survived: ${formatDuration(summary.elapsedSeconds)}${this.newBestTag(comparison.survivalSeconds)}</div>
      ${this.renderRecords(previousBest, comparison, summary.difficulty, summary.mode)}
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
      // Phase 39: Play Again re-opens the difficulty/mode picker rather than
      // silently restarting with whatever settings the previous run used.
      gameEvents.emit('request-run-restart');
    });

    this.overlay.hidden = false;
  }

  private newBestTag(beaten: boolean): string {
    return beaten ? ' <span class="new-best">NEW BEST!</span>' : '';
  }

  /**
   * Shows what the player was chasing on this difficulty+mode. On a first-ever
   * run there is nothing to compare against, so it says so rather than
   * printing three zeroes and three misleading NEW BEST! tags.
   */
  private renderRecords(
    previous: RunRecord | null,
    comparison: RecordComparison,
    difficulty: string,
    mode: string,
  ): string {
    const label = `${difficulty} / ${mode}`;
    if (!previous || comparison.isFirstRun) {
      return `<h3>Records (${label})</h3><div>First run on these settings - this is your benchmark.</div>`;
    }

    return `
      <h3>Previous best (${label})</h3>
      <div>Net worth: $${previous.bestNetWorth}</div>
      <div>Longest survival: ${formatDuration(previous.longestSurvivalSeconds)}</div>
      <div>Most days survived: ${previous.mostDaysSurvived}</div>
      <div>Runs completed: ${previous.runsCompleted}</div>
    `;
  }
}
