import { BUILDING_DEFINITIONS, PlacedBuilding, RESOURCE_LABELS, ResourceKey } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';
import {
  BuildingProductivity,
  ResourceHistoryEntry,
  getBuildingProductivity,
  getPlacedBuildings,
  getResourceHistory,
} from '../state/gameState';

/** Fixed pixel size of each resource's mini sparkline canvas - small enough that a dozen of them fit in one panel without a chart library. */
const SPARKLINE_WIDTH = 90;
const SPARKLINE_HEIGHT = 22;

type SortDirection = 'asc' | 'desc';

/**
 * Phase 49 (Tier-1 roadmap: Statistics & Efficiency Panel). An opt-in,
 * off-by-default DOM overlay - toggled by the 'V' hotkey (MainScene's
 * setupHotkeys) or the building bar's "Stats" button, both of which just
 * emit `'toggle-statistics-panel'` and leave all shown/hidden state here.
 * Purely observational: every number it shows comes from gameState's Phase
 * 49 read-only tracking (`getResourceHistory`/`getBuildingProductivity`),
 * itself fed by lightweight accumulators inside `runProductionTick` that
 * don't alter any production/staffing/upkeep outcome.
 *
 * Two sections:
 *  - Resource Trends: one row per resource with any production-tick history,
 *    a tiny canvas sparkline of the net rate over the tracked window, and the
 *    last tick's produced/consumed/net numbers.
 *  - Building Productivity: every currently-placed building gateState
 *    actually tracks (production/harvest buildings only - see
 *    getBuildingProductivity's doc comment), as a sortable-by-click list of
 *    "active ticks / window" percentage plus the current block reason.
 *
 * Deliberately re-renders only while visible (gated in the 'production-tick'
 * listener) so an idle, hidden panel costs nothing every 2s tick.
 */
export class StatisticsPanel {
  private panel: HTMLDivElement;
  private resourceSection: HTMLDivElement;
  private buildingSection: HTMLDivElement;
  private visible = false;
  private sortDirection: SortDirection = 'asc';
  private readonly resourceCanvases = new Map<ResourceKey, HTMLCanvasElement>();
  private readonly resourceValueLabels = new Map<ResourceKey, HTMLDivElement>();

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'statistics-panel';
    this.panel.hidden = true;

    const header = document.createElement('div');
    header.className = 'statistics-panel-header';

    const title = document.createElement('span');
    title.textContent = 'Statistics & Efficiency';
    header.appendChild(title);

    const closeButton = document.createElement('button');
    closeButton.className = 'statistics-panel-close';
    closeButton.textContent = '✕';
    closeButton.title = 'Close';
    closeButton.addEventListener('click', () => this.setVisible(false));
    header.appendChild(closeButton);

    this.panel.appendChild(header);

    const resourceHeading = document.createElement('div');
    resourceHeading.className = 'statistics-panel-section-title';
    resourceHeading.textContent = 'Resource Trends (last tick, sparkline = net rate)';
    this.panel.appendChild(resourceHeading);

    this.resourceSection = document.createElement('div');
    this.resourceSection.className = 'statistics-panel-resources';
    this.panel.appendChild(this.resourceSection);

    const buildingHeading = document.createElement('div');
    buildingHeading.className = 'statistics-panel-section-title statistics-panel-sort-heading';
    buildingHeading.textContent = 'Building Productivity (click to sort) ↕';
    buildingHeading.addEventListener('click', () => this.toggleSort());
    this.panel.appendChild(buildingHeading);

    this.buildingSection = document.createElement('div');
    this.buildingSection.className = 'statistics-panel-buildings';
    this.panel.appendChild(this.buildingSection);

    container.appendChild(this.panel);

    gameEvents.on('toggle-statistics-panel', () => this.setVisible(!this.visible));
    gameEvents.on('production-tick', () => {
      if (this.visible) {
        this.render();
      }
    });
    gameEvents.on('game-reset', () => {
      if (this.visible) {
        this.render();
      }
    });
  }

  private setVisible(visible: boolean): void {
    this.visible = visible;
    this.panel.hidden = !visible;
    if (visible) {
      this.render();
    }
  }

  private toggleSort(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    if (this.visible) {
      this.render();
    }
  }

  private render(): void {
    this.renderResourceTrends();
    this.renderBuildingProductivity();
  }

  private getOrCreateResourceRow(key: ResourceKey): { canvas: HTMLCanvasElement; valueLabel: HTMLDivElement } {
    let canvas = this.resourceCanvases.get(key);
    let valueLabel = this.resourceValueLabels.get(key);
    if (canvas && valueLabel) {
      return { canvas, valueLabel };
    }

    const row = document.createElement('div');
    row.className = 'statistics-panel-resource-row';

    const label = document.createElement('span');
    label.className = 'statistics-panel-resource-label';
    label.textContent = RESOURCE_LABELS[key];
    row.appendChild(label);

    canvas = document.createElement('canvas');
    canvas.width = SPARKLINE_WIDTH;
    canvas.height = SPARKLINE_HEIGHT;
    canvas.className = 'statistics-panel-sparkline';
    row.appendChild(canvas);

    valueLabel = document.createElement('div');
    valueLabel.className = 'statistics-panel-resource-value';
    row.appendChild(valueLabel);

    this.resourceSection.appendChild(row);
    this.resourceCanvases.set(key, canvas);
    this.resourceValueLabels.set(key, valueLabel);
    return { canvas, valueLabel };
  }

  private renderResourceTrends(): void {
    for (const key of Object.keys(RESOURCE_LABELS) as ResourceKey[]) {
      const history = getResourceHistory(key);
      if (history.length === 0) {
        continue;
      }
      const { canvas, valueLabel } = this.getOrCreateResourceRow(key);
      this.drawSparkline(canvas, history);

      const latest = history[history.length - 1];
      const sign = latest.net > 0 ? '+' : '';
      valueLabel.textContent = `+${latest.produced}/-${latest.consumed} (net ${sign}${latest.net})`;
      valueLabel.classList.toggle('positive', latest.net > 0);
      valueLabel.classList.toggle('negative', latest.net < 0);
    }
  }

  private drawSparkline(canvas: HTMLCanvasElement, history: readonly ResourceHistoryEntry[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const midY = height / 2;
    ctx.strokeStyle = '#5b3a29';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    const nets = history.map((entry) => entry.net);
    const maxAbs = Math.max(0.1, ...nets.map((net) => Math.abs(net)));

    ctx.strokeStyle = nets[nets.length - 1] >= 0 ? '#8bc34a' : '#ef5350';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    nets.forEach((net, index) => {
      const x = nets.length > 1 ? (index / (nets.length - 1)) * (width - 2) + 1 : width / 2;
      const y = midY - (net / maxAbs) * (midY - 2);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  private renderBuildingProductivity(): void {
    this.buildingSection.innerHTML = '';

    const rows: { building: PlacedBuilding; productivity: BuildingProductivity }[] = [];
    for (const building of getPlacedBuildings()) {
      const productivity = getBuildingProductivity(building.id);
      if (productivity) {
        rows.push({ building, productivity });
      }
    }

    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'statistics-panel-empty';
      empty.textContent = 'No production buildings placed yet.';
      this.buildingSection.appendChild(empty);
      return;
    }

    const ratio = (entry: { productivity: BuildingProductivity }): number =>
      entry.productivity.totalTicks === 0 ? 1 : entry.productivity.activeTicks / entry.productivity.totalTicks;

    rows.sort((a, b) => (this.sortDirection === 'asc' ? ratio(a) - ratio(b) : ratio(b) - ratio(a)));

    for (const { building, productivity } of rows) {
      this.buildingSection.appendChild(this.renderBuildingRow(building, productivity));
    }
  }

  private renderBuildingRow(building: PlacedBuilding, productivity: BuildingProductivity): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'statistics-panel-building-row';

    const percent =
      productivity.totalTicks === 0 ? 100 : Math.round((productivity.activeTicks / productivity.totalTicks) * 100);

    const label = document.createElement('span');
    label.className = 'statistics-panel-building-label';
    label.textContent = `${BUILDING_DEFINITIONS[building.type].label} (${building.tileX},${building.tileY})`;
    row.appendChild(label);

    const percentLabel = document.createElement('span');
    percentLabel.className = 'statistics-panel-building-percent';
    percentLabel.textContent = `${percent}%`;
    percentLabel.classList.add(percent >= 70 ? 'good' : percent >= 30 ? 'ok' : 'bad');
    row.appendChild(percentLabel);

    const reasonLabel = document.createElement('span');
    reasonLabel.className = 'statistics-panel-building-reason';
    reasonLabel.textContent = productivity.blockReason ?? 'Running';
    row.appendChild(reasonLabel);

    return row;
  }
}
