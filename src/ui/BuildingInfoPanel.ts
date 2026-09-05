import {
  AnimalConfig,
  AutoSale,
  BUILDING_DEFINITIONS,
  BuildingType,
  PlacedBuilding,
  ResourceKey,
  getWorkersRequired,
} from '../config/buildingConfig';
import { COWBOY_MAX_PER_BARRACKS, COWBOY_TRAIN_COST } from '../config/constants';
import { gameEvents } from '../state/gameEvents';
import { buyAnimal, getMoney, hasAdjacentFence, trainCowboy } from '../state/gameState';

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  rawMeat: 'Raw Meat',
  meat: 'Meat',
  water: 'Water',
  eggs: 'Eggs',
  leather: 'Leather',
  clothes: 'Clothes',
  logs: 'Logs',
  wood: 'Wood',
  potatoes: 'Potatoes',
  liquor: 'Liquor',
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
    const workersRequired = getWorkersRequired(this.selected.type);
    const workersText =
      workersRequired > 0 ? `Workers: ${this.selected.assignedWorkers}/${workersRequired}` : null;
    const isSupermarket = this.selected.type === BuildingType.Supermarket;
    const isSaloon = this.selected.type === BuildingType.Saloon;
    const isBarracks = this.selected.type === BuildingType.Barracks;
    const statusText = production
      ? `Production: ${this.selected.active ? 'On' : 'Off'}`
      : isBarracks
        ? `Staffed: ${this.selected.staffed ? 'Active' : 'Inactive (understaffed)'}`
        : definition.requiresWorkers && !isSupermarket && !isSaloon
          ? `Storage bonus: ${this.selected.staffed ? 'Active' : 'Inactive (understaffed)'}`
          : null;
    const saleText = isSupermarket
      ? this.formatSaleText(this.selected.lastSale, this.selected.staffed)
      : isSaloon
        ? this.formatSaleText(this.selected.saloonSale, this.selected.staffed)
        : null;
    const animalConfig = definition.animal;
    const animalText = animalConfig ? `Animals: ${this.selected.animalCount}/${animalConfig.maxAnimals}` : null;
    const cowboyText = isBarracks ? `Cowboys: ${this.selected.cowboyCount}/${COWBOY_MAX_PER_BARRACKS}` : null;
    const isDisabled = this.selected.hp <= 0;
    const hpText = `HP: ${this.selected.hp}/${definition.maxHp}${isDisabled ? ' (Disabled)' : ''}`;

    this.panel.hidden = false;
    this.panel.innerHTML = `
      <strong>${definition.label}</strong>
      <div${isDisabled ? ' class="hp-disabled"' : ''}>${hpText}</div>
      ${statusText ? `<div>${statusText}</div>` : ''}
      ${saleText ? `<div>${saleText}</div>` : ''}
      ${inputText ? `<div>Consumes: ${inputText}</div>` : ''}
      ${outputText ? `<div>Produces: ${outputText}</div>` : ''}
      ${workersText ? `<div>${workersText}</div>` : ''}
      ${animalText ? `<div>${animalText}</div>` : ''}
      ${cowboyText ? `<div>${cowboyText}</div>` : ''}
    `;

    if (animalConfig) {
      this.renderBuyAnimalButton(this.selected, animalConfig);
    }
    if (isBarracks) {
      this.renderTrainCowboyButton(this.selected);
    }
  }

  private renderBuyAnimalButton(building: PlacedBuilding, animalConfig: AnimalConfig): void {
    const blockReason = !hasAdjacentFence(building)
      ? 'requires an adjacent Fence'
      : building.animalCount >= animalConfig.maxAnimals
        ? 'at max animals'
        : getMoney() < animalConfig.costPerAnimal
          ? "can't afford"
          : null;

    const button = document.createElement('button');
    button.textContent = `Buy ${animalConfig.animalLabel} ($${animalConfig.costPerAnimal})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      buyAnimal(building.id);
      this.render();
    });
    this.panel.appendChild(button);

    if (blockReason) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = blockReason;
      this.panel.appendChild(hint);
    }
  }

  private renderTrainCowboyButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0
        ? 'disabled'
        : building.cowboyCount >= COWBOY_MAX_PER_BARRACKS
          ? 'at max cowboys'
          : getMoney() < COWBOY_TRAIN_COST
            ? "can't afford"
            : null;

    const button = document.createElement('button');
    button.textContent = `Train Cowboy ($${COWBOY_TRAIN_COST})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      trainCowboy(building.id);
      this.render();
    });
    this.panel.appendChild(button);

    if (blockReason) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = blockReason;
      this.panel.appendChild(hint);
    }
  }

  private formatSaleText<K extends ResourceKey>(sale: AutoSale<K> | undefined, staffed: boolean): string {
    const soldEntries = sale
      ? (Object.entries(sale.sold) as [K, number][]).filter(([, amount]) => amount > 0)
      : [];
    if (sale && soldEntries.length > 0) {
      const parts = soldEntries.map(([key, amount]) => `${amount} ${RESOURCE_LABELS[key]}`);
      return `Sold: ${parts.join(', ')} -> +$${sale.revenue}`;
    }
    if (!staffed) {
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
