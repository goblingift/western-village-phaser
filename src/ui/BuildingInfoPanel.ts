import {
  AnimalConfig,
  AutoSale,
  BUILDING_DEFINITIONS,
  BuildingType,
  HarvestConfig,
  PlacedBuilding,
  RESOURCE_LABELS,
  ResourceKey,
  getWorkersRequired,
} from '../config/buildingConfig';
import { VEGETATION_DEFINITIONS } from '../config/vegetationConfig';
import { countVegetationInRadius } from '../state/vegetation';
import {
  BANK_TRANSACTION_AMOUNT,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_TRAIN_COST,
  MOUNTED_COWBOY_MAX_PER_HORSERY,
  MOUNTED_COWBOY_TRAIN_COST,
  WELL_MAX_WATER_DISTANCE_TILES,
} from '../config/constants';
import { BuildingRemovedPayload, gameEvents } from '../state/gameEvents';
import {
  buyAnimal,
  demolishBuilding,
  depositToBank,
  getHarvestCenterTile,
  getMoney,
  getRepairCost,
  getWellWaterDistance,
  hasAdjacentFence,
  repairBuilding,
  trainCowboy,
  trainMountedCowboy,
  withdrawFromBank,
} from '../state/gameState';

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

    // Phase 31: a building can now vanish while its panel is open (raid kill
    // or bulldozer), so the panel drops any reference to a removed building
    // rather than continuing to render a detached record.
    gameEvents.on('building-removed', ({ building }: BuildingRemovedPayload) => {
      if (this.selected?.id === building.id) {
        this.selected = null;
        this.render();
      }
    });
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
    const isHorsery = this.selected.type === BuildingType.Horsery;
    const isBank = this.selected.type === BuildingType.Bank;
    // Harvesters (Forestry, Cactus Milker) have no `production` block but are
    // still production buildings from the player's point of view.
    const statusText = production || definition.harvest
      ? `Production: ${this.selected.active ? 'On' : 'Off'}`
      : isBarracks || isHorsery || isBank
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
    const mountedCowboyText = isHorsery
      ? `Cowboys on Horse: ${this.selected.mountedCowboyCount}/${MOUNTED_COWBOY_MAX_PER_HORSERY}`
      : null;
    const balanceText = isBank ? `Balance: $${this.selected.bankBalance}` : null;
    const isDamaged = this.selected.hp < definition.maxHp;
    const hpText = `HP: ${this.selected.hp}/${definition.maxHp}`;

    // Phase 32: an unpaid building idles until the town can afford it again,
    // which is a very different (and recoverable) failure from understaffing,
    // so it gets its own prominent line rather than being folded into status.
    const upkeepText =
      definition.upkeep > 0
        ? `Upkeep: $${definition.upkeep}/tick${this.selected.disabled ? ' - UNPAID, idle' : ''}`
        : null;

    const harvestStatus = definition.harvest
      ? this.describeHarvestStatus(this.selected, definition.harvest)
      : null;

    // Phase 30: a Well's yield depends on how close it got to water.
    const wellDistance =
      this.selected.type === BuildingType.Well
        ? getWellWaterDistance(this.selected.tileX, this.selected.tileY, this.selected.type)
        : null;
    const wellText =
      this.selected.type === BuildingType.Well
        ? wellDistance === null
          ? `No water within ${WELL_MAX_WATER_DISTANCE_TILES} tiles - dry`
          : `Water ${wellDistance} tile${wellDistance === 1 ? '' : 's'} away`
        : null;

    this.panel.hidden = false;
    this.panel.innerHTML = `
      <strong>${definition.label}</strong>
      <div${this.selected.disabled ? ' class="hp-disabled"' : ''}>${hpText}</div>
      ${statusText ? `<div>${statusText}</div>` : ''}
      ${upkeepText ? `<div${this.selected.disabled ? ' class="hp-disabled"' : ''}>${upkeepText}</div>` : ''}
      ${saleText ? `<div>${saleText}</div>` : ''}
      ${harvestStatus ? `<div${harvestStatus.blocked ? ' class="hp-disabled"' : ''}>${harvestStatus.text}</div>` : ''}
      ${wellText ? `<div>${wellText}</div>` : ''}
      ${inputText ? `<div>Consumes: ${inputText}</div>` : ''}
      ${outputText ? `<div>Produces: ${outputText}</div>` : ''}
      ${workersText ? `<div>${workersText}</div>` : ''}
      ${animalText ? `<div>${animalText}</div>` : ''}
      ${cowboyText ? `<div>${cowboyText}</div>` : ''}
      ${mountedCowboyText ? `<div>${mountedCowboyText}</div>` : ''}
      ${balanceText ? `<div>${balanceText}</div>` : ''}
    `;

    if (isDamaged) {
      this.renderRepairButton(this.selected);
    }
    if (animalConfig) {
      this.renderBuyAnimalButton(this.selected, animalConfig);
    }
    if (isBarracks) {
      this.renderTrainCowboyButton(this.selected);
    }
    if (isHorsery) {
      this.renderTrainMountedCowboyButton(this.selected);
    }
    if (isBank) {
      this.renderDepositButton(this.selected);
      this.renderWithdrawButton(this.selected);
    }
    this.renderDemolishButton(this.selected);
  }

  /**
   * Phase 34 bug fix. This line used to be inferred purely from
   * `lastHarvest`, which is only ever written by runHarvest - and runHarvest
   * sits behind the hp/staffing/upkeep gates in runProductionTick. So a
   * harvester that was understaffed, unpaid, or simply placed ten seconds ago
   * had `lastHarvest === undefined` and got told "No Trees left within 5
   * tiles", which was frequently a flat lie and sent players off to rebuild a
   * building that was fine.
   *
   * The panel now asks the vegetation module what is actually standing in
   * range (countVegetationInRadius was already written for exactly this and
   * had zero call sites), and reports blockers in the order they actually
   * apply in the production tick: destroyed -> understaffed -> upkeep unpaid
   * -> nothing in range -> running (with a low-stock warning).
   */
  private describeHarvestStatus(
    building: PlacedBuilding,
    harvest: HarvestConfig,
  ): { text: string; blocked: boolean } {
    const center = getHarvestCenterTile(building.tileX, building.tileY, building.type);
    const inRange = countVegetationInRadius(harvest.kind, center.tileX, center.tileY, harvest.radiusTiles);
    const definition = VEGETATION_DEFINITIONS[harvest.kind];
    const plural = definition.pluralLabel;

    if (building.hp <= 0) {
      return { text: `Not harvesting: destroyed`, blocked: true };
    }
    if (!building.staffed) {
      const required = getWorkersRequired(building.type);
      return {
        text: `Not harvesting: understaffed (${building.assignedWorkers}/${required} workers)`,
        blocked: true,
      };
    }
    if (building.disabled) {
      return { text: 'Not harvesting: upkeep unpaid', blocked: true };
    }
    if (inRange === 0) {
      return {
        text: `Not harvesting: no ${plural} within ${harvest.radiusTiles} tiles`,
        blocked: true,
      };
    }

    const stock = `${inRange} ${inRange === 1 ? definition.label : plural} in range`;
    if (building.lastHarvest && building.lastHarvest > 0) {
      return { text: `Harvested ${building.lastHarvest} ${definition.label} - ${stock}`, blocked: false };
    }
    // In range but nothing taken last tick: the nearest entity was drained to
    // exactly 0 on that tick, or this is the building's very first tick.
    return { text: `Ready to harvest - ${stock}`, blocked: false };
  }

  /**
   * Phase 31: with auto-regen gone, this button is the only way HP comes
   * back. Repairs always go to full - a partial-repair slider would be more
   * granular but the cost is already pro-rated by missing HP, so paying
   * twice for two halves costs the same as paying once for the whole.
   */
  private renderRepairButton(building: PlacedBuilding): void {
    const cost = getRepairCost(building);
    const blockReason = getMoney() < cost ? "can't afford" : null;

    const button = document.createElement('button');
    button.textContent = `Repair ($${cost})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      repairBuilding(building.id);
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

  /** Phase 31: per-building demolish, alongside the building bar's bulldozer mode for clearing several in a row. */
  private renderDemolishButton(building: PlacedBuilding): void {
    const button = document.createElement('button');
    button.className = 'danger';
    button.textContent = 'Demolish';
    button.addEventListener('click', () => {
      demolishBuilding(building.id);
      gameEvents.emit('building-selected', null);
    });
    this.panel.appendChild(button);
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

  /** Mirrors renderTrainCowboyButton exactly, gated on Horsery's mountedCowboyCount/MOUNTED_COWBOY_MAX_PER_HORSERY/MOUNTED_COWBOY_TRAIN_COST instead. */
  private renderTrainMountedCowboyButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0
        ? 'disabled'
        : building.mountedCowboyCount >= MOUNTED_COWBOY_MAX_PER_HORSERY
          ? 'at max cowboys on horse'
          : getMoney() < MOUNTED_COWBOY_TRAIN_COST
            ? "can't afford"
            : null;

    const button = document.createElement('button');
    button.textContent = `Train Cowboy on Horse ($${MOUNTED_COWBOY_TRAIN_COST})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      trainMountedCowboy(building.id);
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

  private renderDepositButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0
        ? 'disabled'
        : getMoney() < BANK_TRANSACTION_AMOUNT
          ? "can't afford"
          : null;

    const button = document.createElement('button');
    button.textContent = `Deposit $${BANK_TRANSACTION_AMOUNT}`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      depositToBank(building.id);
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

  /** Mirrors renderDepositButton in the opposite direction: gated on the Bank's own bankBalance instead of the player's money. */
  private renderWithdrawButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0
        ? 'disabled'
        : building.bankBalance < BANK_TRANSACTION_AMOUNT
          ? 'nothing to withdraw'
          : null;

    const button = document.createElement('button');
    button.textContent = `Withdraw $${BANK_TRANSACTION_AMOUNT}`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      withdrawFromBank(building.id);
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
