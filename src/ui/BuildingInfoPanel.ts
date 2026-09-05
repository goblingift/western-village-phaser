import { BUILDING_DEFINITIONS, PlacedBuilding, ResourceKey } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  rawMeat: 'Raw Meat',
  meat: 'Meat',
  water: 'Water',
  eggs: 'Eggs',
};

export class BuildingInfoPanel {
  private panel: HTMLDivElement;
  private selected: PlacedBuilding | null = null;

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'building-info-panel';
    this.panel.hidden = true;
    container.appendChild(this.panel);

    gameEvents.on('building-selected', (building: PlacedBuilding | null) => {
      this.selected = building;
      this.render();
    });
    gameEvents.on('production-tick', () => this.render());
    gameEvents.on('building-harvested', () => this.render());
  }

  private render(): void {
    if (!this.selected) {
      this.panel.hidden = true;
      return;
    }

    const definition = BUILDING_DEFINITIONS[this.selected.type];
    const production = definition.production;
    const inputText = production?.inputs ? this.formatResourceMap(production.inputs) : null;
    const outputText = production?.outputs ? this.formatResourceMap(production.outputs) : null;
    const bufferEntries = (Object.entries(this.selected.buffer) as [ResourceKey, number][]).filter(
      ([, amount]) => amount > 0,
    );
    const readyText =
      bufferEntries.length > 0
        ? `Ready to collect: ${this.formatResourceMap(Object.fromEntries(bufferEntries))}`
        : null;

    this.panel.hidden = false;
    this.panel.innerHTML = `
      <strong>${definition.label}</strong>
      <div>Production: ${production ? (this.selected.active ? 'On' : 'Off') : '—'}</div>
      ${inputText ? `<div>Consumes: ${inputText}</div>` : ''}
      ${outputText ? `<div>Produces: ${outputText}</div>` : ''}
      ${readyText ? `<div>${readyText} (click to collect)</div>` : ''}
    `;
  }

  private formatResourceMap(map: Partial<Record<ResourceKey, number>>): string {
    return (Object.entries(map) as [ResourceKey, number][])
      .map(([key, amount]) => `${Math.round(amount * 10) / 10} ${RESOURCE_LABELS[key]}`)
      .join(', ');
  }
}
