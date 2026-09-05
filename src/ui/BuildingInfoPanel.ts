import {
  BUILDING_DEFINITIONS,
  BuildingType,
  PlacedBuilding,
  ResourceKey,
  getWorkersRequired,
} from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';
import { hasAdjacentFence } from '../state/gameState';

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
    const fencedText = production?.requiresFence
      ? `Fenced: ${hasAdjacentFence(this.selected) ? 'Yes (full output)' : 'No (half output)'}`
      : null;
    const workersRequired = getWorkersRequired(this.selected.type);
    const workersText =
      workersRequired > 0 ? `Workers: ${this.selected.assignedWorkers}/${workersRequired}` : null;
    const isSupermarket = this.selected.type === BuildingType.Supermarket;
    const statusText = production
      ? `Production: ${this.selected.active ? 'On' : 'Off'}`
      : definition.requiresWorkers && !isSupermarket
        ? `Storage bonus: ${this.selected.staffed ? 'Active' : 'Inactive (understaffed)'}`
        : null;
    const saleText = isSupermarket ? this.formatSaleText(this.selected) : null;

    this.panel.hidden = false;
    this.panel.innerHTML = `
      <strong>${definition.label}</strong>
      ${statusText ? `<div>${statusText}</div>` : ''}
      ${saleText ? `<div>${saleText}</div>` : ''}
      ${inputText ? `<div>Consumes: ${inputText}</div>` : ''}
      ${outputText ? `<div>Produces: ${outputText}</div>` : ''}
      ${workersText ? `<div>${workersText}</div>` : ''}
      ${fencedText ? `<div>${fencedText}</div>` : ''}
    `;
  }

  private formatSaleText(building: PlacedBuilding): string {
    const sale = building.lastSale;
    if (sale && (sale.meat > 0 || sale.eggs > 0)) {
      const parts: string[] = [];
      if (sale.meat > 0) {
        parts.push(`${sale.meat} Meat`);
      }
      if (sale.eggs > 0) {
        parts.push(`${sale.eggs} ${sale.eggs === 1 ? 'Egg' : 'Eggs'}`);
      }
      return `Sold: ${parts.join(', ')} -> +$${sale.revenue}`;
    }
    if (!building.staffed) {
      return 'Not selling (understaffed)';
    }
    return 'No stock to sell';
  }

  private formatResourceMap(map: Partial<Record<ResourceKey, number>>): string {
    return (Object.entries(map) as [ResourceKey, number][])
      .map(([key, amount]) => `${Math.round(amount * 10) / 10} ${RESOURCE_LABELS[key]}`)
      .join(', ');
  }
}
