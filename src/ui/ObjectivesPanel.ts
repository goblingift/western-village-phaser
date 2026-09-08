import { formatObjectiveProgress } from '../config/objectives';
import { TOWN_RANK_LABELS } from '../config/townRank';
import { gameEvents } from '../state/gameEvents';
import { ObjectiveView, getActiveObjectives, getCompletedObjectiveCount, getTownRankProgress } from '../state/gameState';

/**
 * Phase 56: Objectives / Quest Chain. A small, always-on DOM widget (unlike
 * StatisticsPanel's opt-in toggle) docked top-center of #stage - the only
 * spot free of the existing corner overlays (ResourceHudPanel/minimap occupy
 * the canvas top-left, BuildingInfoPanel bottom-right, NotificationLogPanel
 * bottom-left, StatisticsPanel top-right-but-hidden-by-default). Glanceable
 * by design: at most ROLLING_OBJECTIVE_SLOT_COUNT rows, no scroll, no
 * collapse control.
 *
 * Purely a read-only projection of gameState's rolling objective set
 * (getActiveObjectives/getCompletedObjectiveCount) - it owns no state of its
 * own and re-renders on the same 'production-tick' cadence
 * runObjectivesCheck advances progress on, plus 'game-reset'/'game-loaded'
 * so a fresh or restored run's quest list shows immediately rather than
 * waiting up to PRODUCTION_TICK_MS for the next tick.
 */
export class ObjectivesPanel {
  private panel: HTMLDivElement;
  private rankHeader: HTMLDivElement;
  private header: HTMLDivElement;
  private list: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'objectives-panel';

    // Phase 83: Town Rank Ladder header, above the existing objectives list -
    // reuses the same 'production-tick'/'game-reset'/'game-loaded' render
    // cycle the objectives list already listens to, no new event wiring
    // needed since gameState's runTownRankCheck runs every tick alongside
    // runObjectivesCheck.
    this.rankHeader = document.createElement('div');
    this.rankHeader.id = 'town-rank-header';
    this.panel.appendChild(this.rankHeader);

    this.header = document.createElement('div');
    this.header.className = 'objectives-panel-header';
    this.panel.appendChild(this.header);

    this.list = document.createElement('div');
    this.list.className = 'objectives-panel-list';
    this.panel.appendChild(this.list);

    container.appendChild(this.panel);

    gameEvents.on('production-tick', () => this.render());
    gameEvents.on('game-reset', () => this.render());
    gameEvents.on('game-loaded', () => this.render());

    this.render();
  }

  private renderRankHeader(): void {
    const { currentRank, nextRank, progressFraction, whatIsNeeded } = getTownRankProgress();
    const rankLabel = TOWN_RANK_LABELS[currentRank];

    if (!nextRank) {
      this.rankHeader.innerHTML = `<div class="town-rank-name">${rankLabel}</div><div class="town-rank-next">Max rank reached</div>`;
      return;
    }

    const needText = whatIsNeeded
      .map((axis) => `${axis.label} ${Math.floor(axis.current)}/${axis.required}`)
      .join(', ');
    const percent = Math.round(progressFraction * 100);

    this.rankHeader.innerHTML = `
      <div class="town-rank-name">${rankLabel}</div>
      <div class="town-rank-progress-bar"><div class="town-rank-progress-fill" style="width: ${percent}%"></div></div>
      <div class="town-rank-next">Next: ${TOWN_RANK_LABELS[nextRank]} - ${needText}</div>
    `;
  }

  private render(): void {
    this.renderRankHeader();

    const objectives = getActiveObjectives();
    const completedCount = getCompletedObjectiveCount();
    this.header.textContent = `Objectives${completedCount > 0 ? ` (${completedCount} completed)` : ''}`;

    this.list.innerHTML = '';

    if (objectives.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'objectives-panel-empty';
      empty.textContent = 'All objectives complete!';
      this.list.appendChild(empty);
      return;
    }

    for (const objective of objectives) {
      this.list.appendChild(this.renderRow(objective));
    }
  }

  private renderRow(objective: ObjectiveView): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'objectives-panel-row';

    const label = document.createElement('span');
    label.className = 'objectives-panel-label';
    label.textContent = objective.description;
    row.appendChild(label);

    const value = document.createElement('span');
    value.className = 'objectives-panel-value';
    value.textContent = formatObjectiveProgress(objective, objective.progress);
    row.appendChild(value);

    return row;
  }
}
