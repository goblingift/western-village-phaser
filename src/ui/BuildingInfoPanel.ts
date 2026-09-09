import {
  AnimalConfig,
  AutoSale,
  BRAWLER_TRAIN_MATERIALS,
  BUILDING_DEFINITIONS,
  BuildingType,
  DYNAMITER_TRAIN_MATERIALS,
  HOUSE_TIER_CONFIG,
  HarvestConfig,
  HouseTier,
  MARKETABLE_RESOURCE_KEYS,
  MarketableResourceKey,
  PlacedBuilding,
  FIXED_RATE_SELL_TABLES,
  RESOURCE_LABELS,
  ResourceKey,
  TradeOrderConfig,
  UNIT_KIND_LABELS,
  WorkerPriority,
  getWorkersRequired,
} from '../config/buildingConfig';
import { getResourceConsumers } from '../config/resourceGraph';
import { VEGETATION_DEFINITIONS } from '../config/vegetationConfig';
import { countVegetationInRadius } from '../state/vegetation';
import {
  BANK_TRANSACTION_AMOUNT,
  BRAWLER_MAX_PER_BARRACKS,
  BRAWLER_TRAIN_COST,
  BROTHEL_LADY_COST,
  BROTHEL_MAX_LADIES,
  BROTHEL_SERVICE_RADIUS_TILES,
  CHURCH_MAX_CLERGY,
  CHURCH_NUN_COST,
  CHURCH_PRIEST_COST,
  CHURCH_PRIEST_TAX_BONUS,
  COAL_MAX_DISTANCE_TILES,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_TRAIN_COST,
  DYNAMITER_MAX_PER_BARRACKS,
  DYNAMITER_TRAIN_COST,
  GRAVEL_MAX_DISTANCE_TILES,
  HOUSE_TIER_HYSTERESIS_TICKS,
  MOUNTED_COWBOY_MAX_PER_HORSERY,
  MOUNTED_COWBOY_TRAIN_COST,
  TRADING_POST_DEFAULT_AMOUNT,
  TRADING_POST_DEFAULT_THRESHOLD,
  ADJACENCY_RADIUS_TILES,
  INDUSTRY_NUISANCE_RADIUS_TILES,
  RIFLE_DAMAGE_MULTIPLIER,
  WATCHTOWER_DAMAGE,
  WATCHTOWER_RANGE_TILES,
  WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES,
  WATER_TOWER_IRRIGATION_RADIUS_TILES,
  WELL_MAX_WATER_DISTANCE_TILES,
} from '../config/constants';
import { BuildingRemovedPayload, gameEvents } from '../state/gameEvents';
import {
  buyAnimal,
  clearRallyPoint,
  demolishBuilding,
  depositToBank,
  getChurchRadius,
  getCropOutputMultiplier,
  getCropWaterDistance,
  getEnclosureBuyStatus,
  getGravelDistance,
  getHarvestCenterTile,
  getLaborShortfall,
  getMoney,
  getNearestChurchDistance,
  getNearestStaffedWaterTowerDistance,
  getRepairCost,
  getAdjacencyStatus,
  getIndustryNuisance,
  getResources,
  getRockDistance,
  getWellWaterDistance,
  hireLady,
  hireNun,
  hirePriest,
  isServedByChurch,
  repairBuilding,
  setBuildingPriority,
  setGateOpen,
  setTradingPostOrder,
  trainBrawler,
  trainCowboy,
  trainDynamiter,
  trainMountedCowboy,
  withdrawFromBank,
} from '../state/gameState';
import { getCurrentMarketPrice } from '../state/market';

const WORKER_PRIORITIES: WorkerPriority[] = ['high', 'normal', 'low'];

export class BuildingInfoPanel {
  private panel: HTMLDivElement;
  private selected: PlacedBuilding | null = null;
  /**
   * Phase 53: mirrors MainScene's own rallyPointModeBuildingId (the source of
   * truth for which right-click actually gets intercepted) purely so the
   * "Set Rally Point"/"Cancel" button label reflects whether a pick is
   * currently armed for this building - the panel never decides the mode
   * itself, only requests/cancels it via the 'rally-point-mode-changed' event.
   */
  private rallyPointArmedFor: string | null = null;

  /**
   * Phase 62: which tier's tab is currently open in a House's info panel.
   * Defaults to the building's own current tier every time selection changes
   * (a fresh look at a House should show what's actually happening, not
   * whatever tab was left open on a previously-selected House) but otherwise
   * persists across the per-tick re-renders `render()` already does, so
   * clicking "Tier 3" doesn't get stomped back to "current" on the next tick.
   */
  private viewedHouseTier: HouseTier | null = null;

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'building-info-panel';
    this.panel.hidden = true;
    container.appendChild(this.panel);

    gameEvents.on('building-selected', (building: PlacedBuilding | null) => {
      this.selected = building;
      this.viewedHouseTier = building && building.type === BuildingType.House ? building.houseTier : null;
      this.render();
    });
    gameEvents.on('production-tick', () => this.render());
    gameEvents.on('rally-point-changed', () => this.render());
    // Phase 69: a gate can be toggled elsewhere (the 'G' hotkey, the building
    // bar's all-gates button) while its info panel is open, so re-render on
    // the same event MainScene listens to for the sprite swap, not just on
    // this panel's own button clicks.
    gameEvents.on('gate-state-changed', () => this.render());
    gameEvents.on('rally-point-mode-changed', (buildingId: string | null) => {
      this.rallyPointArmedFor = buildingId;
      this.render();
    });

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
    // Phase 93: "Produces: 1.2 Logs" never said what to DO with the logs. This
    // answers it at the exact moment the player is looking at the producer.
    const sellHintText = this.formatSellHint(this.selected.type);
    // Phase 95: district synergy - whether this consumer is standing near
    // producers of its own inputs, and what that's worth.
    const adjacencyText = this.formatAdjacencyText(this.selected);
    const nuisanceText = this.formatNuisanceText(this.selected);
    const outputText = production?.outputs ? this.formatResourceMap(production.outputs) : null;
    const workersRequired = getWorkersRequired(this.selected.type);
    const workersText =
      workersRequired > 0 ? `Workers: ${this.selected.assignedWorkers}/${workersRequired}` : null;
    const isSupermarket = this.selected.type === BuildingType.Supermarket;
    const isSaloon = this.selected.type === BuildingType.Saloon;
    // Phase 92: the Market Stall is an autonomous seller like Supermarket/
    // Saloon - same "Sold: ... -> +$X" line, its own rate table/sale field.
    const isMarketStall = this.selected.type === BuildingType.MarketStall;
    const isBarracks = this.selected.type === BuildingType.Barracks;
    const isHorsery = this.selected.type === BuildingType.Horsery;
    const isBank = this.selected.type === BuildingType.Bank;
    const isTradingPost = this.selected.type === BuildingType.TradingPost;
    const isWatchtower = this.selected.type === BuildingType.Watchtower;
    const isHouse = this.selected.type === BuildingType.House;
    const isWoodenGate = this.selected.type === BuildingType.WoodenGate;
    const isChurch = this.selected.type === BuildingType.Church;
    const isBrothel = this.selected.type === BuildingType.Brothel;
    // Construction mechanic: while under construction, none of the normal
    // staffed/production/understaffed status text applies yet - a single
    // ticks-remaining line replaces it entirely.
    const isUnderConstruction = (this.selected.constructionTicksRemaining ?? 0) > 0;
    const constructionText = isUnderConstruction
      ? `Under construction: ${this.selected.constructionTicksRemaining} tick${this.selected.constructionTicksRemaining === 1 ? '' : 's'} remaining`
      : null;

    // Harvesters (Forestry, Cactus Milker) have no `production` block but are
    // still production buildings from the player's point of view.
    const statusText = isUnderConstruction
      ? null
      : production || definition.harvest
      ? `Production: ${this.selected.active ? 'On' : 'Off'}`
      : isBarracks || isHorsery || isBank || isTradingPost || isChurch || isBrothel
        ? `Staffed: ${this.selected.staffed ? 'Active' : `Inactive (${this.formatUnderstaffedReason(this.selected, workersRequired)})`}`
        : isWatchtower
          ? `Defense: ${
              this.selected.disabled
                ? 'Inactive (upkeep unpaid)'
                : this.selected.staffed
                  ? 'Active'
                  : `Inactive (${this.formatUnderstaffedReason(this.selected, workersRequired)})`
            }`
          : definition.requiresWorkers && !isSupermarket && !isSaloon && !isMarketStall
            ? `Storage bonus: ${this.selected.staffed ? 'Active' : `Inactive (${this.formatUnderstaffedReason(this.selected, workersRequired)})`}`
            : null;
    // Phase 42: a plain production building's "Production: Off" line doesn't
    // say why - could be missing inputs, could be no staff. Surface the
    // staffing reason as its own line only when staffing is actually the
    // cause; harvesters get the equivalent detail from describeHarvestStatus
    // instead, so this is gated to non-harvest production buildings.
    const understaffedText =
      !isUnderConstruction &&
      production &&
      !definition.harvest &&
      workersRequired > 0 &&
      !this.selected.staffed &&
      this.selected.hp > 0
        ? `Understaffed: ${this.formatUnderstaffedReason(this.selected, workersRequired)}`
        : null;
    const watchtowerText = isWatchtower
      ? `Range: ${WATCHTOWER_RANGE_TILES} tiles | Damage: ${WATCHTOWER_DAMAGE}/shot`
      : null;
    // Phase 94: whether the town's shots are currently rifle-armed. Shown on
    // the Watchtower (the only always-on shooter a player can click) rather
    // than invented as a new HUD element - the multiplier is town-wide and
    // applies to units too, which the wording says explicitly.
    const ammoText = isWatchtower
      ? getResources().rifles > 0
        ? `Ammo: Rifles in stock - every shot in town hits for x${RIFLE_DAMAGE_MULTIPLIER}`
        : 'Ammo: no Rifles - shots hit at base damage (build a Gunsmith)'
      : null;
    const saleText = isSupermarket
      ? this.formatSaleText(this.selected.lastSale, this.selected, workersRequired)
      : isMarketStall
      ? this.formatSaleText(this.selected.marketStallSale, this.selected, workersRequired)
      : isSaloon
        ? this.formatSaleText(this.selected.saloonSale, this.selected, workersRequired)
        : isTradingPost
          ? this.formatSaleText(this.selected.tradingPostSale, this.selected, workersRequired)
          : null;
    const animalConfig = definition.animal;
    const animalText = animalConfig ? `Animals: ${this.selected.animalCount}/${animalConfig.maxAnimals}` : null;
    const enclosureStatusText = animalConfig ? this.formatEnclosureStatusText(this.selected, animalConfig) : null;
    const cowboyText = isBarracks ? `Cowboys: ${this.selected.cowboyCount}/${COWBOY_MAX_PER_BARRACKS}` : null;
    // Phase 58: Barracks now trains two more kinds alongside Cowboy.
    const brawlerText = isBarracks ? `Brawlers: ${this.selected.brawlerCount}/${BRAWLER_MAX_PER_BARRACKS}` : null;
    const dynamiterText = isBarracks
      ? `Dynamiters: ${this.selected.dynamiterCount}/${DYNAMITER_MAX_PER_BARRACKS}`
      : null;
    const mountedCowboyText = isHorsery
      ? `Cowboys on Horse: ${this.selected.mountedCowboyCount}/${MOUNTED_COWBOY_MAX_PER_HORSERY}`
      : null;
    // Phase 53: training is now queued rather than instant; see
    // formatTrainingQueueText for why a later job's tick count never moves
    // until it reaches the front.
    const trainingQueueText = isBarracks || isHorsery ? this.formatTrainingQueueText(this.selected) : null;
    const rallyPointText =
      isBarracks || isHorsery ? `Rally Point: ${this.selected.rallyPoint ? 'set' : 'not set'}` : null;
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

    // Phase 50: Quarry/Iron Mine are hard-gated on Gravel at placement time
    // (getGravelDistance/getPlacementRejection in gameState.ts), so this is
    // purely informational - always "in range" for an already-placed one -
    // but it mirrors the Well's distance readout for the same terrain-gated
    // building family.
    const isGravelGated = this.selected.type === BuildingType.Quarry || this.selected.type === BuildingType.IronMine;
    const gravelDistance = isGravelGated
      ? getGravelDistance(this.selected.tileX, this.selected.tileY, this.selected.type)
      : null;
    const gravelText = isGravelGated
      ? gravelDistance === null
        ? `No Gravel within ${GRAVEL_MAX_DISTANCE_TILES} tiles`
        : gravelDistance === 0
          ? 'Built on Gravel'
          : `Gravel ${gravelDistance} tile${gravelDistance === 1 ? '' : 's'} away`
      : null;

    // Phase 67: Coal Mine mirrors Quarry/Iron Mine's Gravel-distance readout
    // above, just against Rock/getRockDistance - informational only, since
    // placement is already hard-gated on this at build time.
    const isCoalGated = this.selected.type === BuildingType.CoalMine;
    const rockDistance = isCoalGated
      ? getRockDistance(this.selected.tileX, this.selected.tileY, this.selected.type)
      : null;
    const rockText = isCoalGated
      ? rockDistance === null
        ? `No Rock within ${COAL_MAX_DISTANCE_TILES} tiles`
        : rockDistance === 0
          ? 'Built on Rock'
          : `Rock ${rockDistance} tile${rockDistance === 1 ? '' : 's'} away`
      : null;

    // Phase 54: PotatoField's water-dependent output - mirrors the Well/
    // Gravel distance status lines above, plus a note when a Water Tower is
    // actually the thing keeping it alive.
    const isPotatoField = this.selected.type === BuildingType.PotatoField;
    const cropWaterDistance = isPotatoField
      ? getCropWaterDistance(this.selected.tileX, this.selected.tileY, this.selected.type)
      : null;
    const cropTowerDistance = isPotatoField
      ? getNearestStaffedWaterTowerDistance(this.selected.tileX, this.selected.tileY, this.selected.type)
      : null;
    const cropMultiplier = isPotatoField
      ? getCropOutputMultiplier(this.selected.tileX, this.selected.tileY, this.selected.type)
      : null;
    const cropWaterText = isPotatoField
      ? cropWaterDistance === null
        ? `No water within ${WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES} tiles - dry, producing nothing`
        : `Water ${cropWaterDistance} tile${cropWaterDistance === 1 ? '' : 's'} away (${Math.round(
            (cropMultiplier ?? 0) * 100,
          )}% output)${
            cropTowerDistance !== null
              ? ` - irrigated by Water Tower ${cropTowerDistance} tile${cropTowerDistance === 1 ? '' : 's'} away`
              : ''
          }`
      : null;

    // Phase 54: Water Tower's own status - the same hard-gated water-distance
    // readout as a Well (it shares the placement gate), plus its service radius.
    const isWaterTower = this.selected.type === BuildingType.WaterTower;
    const waterTowerDistance = isWaterTower
      ? getWellWaterDistance(this.selected.tileX, this.selected.tileY, this.selected.type)
      : null;
    const waterTowerText = isWaterTower
      ? waterTowerDistance === null
        ? `No water within ${WELL_MAX_WATER_DISTANCE_TILES} tiles`
        : `Water ${waterTowerDistance} tile${waterTowerDistance === 1 ? '' : 's'} away | Irrigates Potato Fields within ${WATER_TOWER_IRRIGATION_RADIUS_TILES} tiles`
      : null;

    // Phase 46: House tier/needs/population/tax block. Houses have no
    // `production`/`animal`/`harvest` config, so none of the lines above
    // apply to them - this is the entirety of a House's panel content besides
    // HP/upkeep/demolish.
    const houseTierText = isHouse ? this.formatHouseTierText(this.selected) : null;
    const houseNeedsText = isHouse ? this.formatHouseNeedsText(this.selected) : null;
    const houseProgressText = isHouse ? this.formatHouseProgressText(this.selected) : null;
    // Phase 62: imminent-decay warning, shown near the current-tier view once
    // the unmet streak is a meaningful fraction of the hysteresis threshold.
    const houseDecayWarningText = isHouse ? this.formatHouseDecayWarning(this.selected) : null;
    // Phase 70: a House's Church coverage - deliberately its own line,
    // rendered independently from formatHouseNeedsText's resource-need list
    // (Church isn't a ResourceKey/HouseNeedGroup, so it can never appear
    // there) and independently from the per-tier tab strip's need display.
    // Only shown when Church coverage is actually relevant to this House:
    // its current tier requires one, OR its next tier (the one it's trying to
    // grow into) will.
    const houseChurchText = isHouse ? this.formatHouseChurchText(this.selected) : null;
    // Phase 70: Church's own clergy/service-radius status.
    const churchClergyText = isChurch
      ? `Nuns: ${this.selected.nunCount ?? 0} | Priests: ${this.selected.priestCount ?? 0}`
      : null;
    const churchRadiusText = isChurch
      ? `Service radius: ${getChurchRadius(this.selected)} tiles${
          (this.selected.priestCount ?? 0) > 0
            ? ` | Priests add +$${CHURCH_PRIEST_TAX_BONUS}/tick tax per served Tier-2/3 House`
            : ''
        }`
      : null;
    // Phase 69: WoodenGate's live open/closed state, shown as its own status
    // line above the toggle button rendered further down.
    const gateStatusText = isWoodenGate
      ? `Gate: ${this.selected.gateOpen === false ? 'Closed (blocks raiders like a Wooden Wall)' : 'Open (passable by everyone, raiders included)'}`
      : null;
    // Phase 72: Brothel's own hire status + live patronage-income readout.
    const ladyText = isBrothel ? `Ladies: ${this.selected.ladyCount ?? 0}/${BROTHEL_MAX_LADIES}` : null;
    const brothelIncomeText = isBrothel ? this.formatBrothelIncomeText(this.selected, workersRequired) : null;

    this.panel.hidden = false;
    this.panel.innerHTML = `
      <strong>${definition.label}</strong>
      <div${this.selected.disabled ? ' class="hp-disabled"' : ''}>${hpText}</div>
      ${constructionText ? `<div>${constructionText}</div>` : ''}
      ${statusText ? `<div>${statusText}</div>` : ''}
      ${watchtowerText ? `<div>${watchtowerText}</div>` : ''}
      ${ammoText ? `<div>${ammoText}</div>` : ''}
      ${upkeepText ? `<div${this.selected.disabled ? ' class="hp-disabled"' : ''}>${upkeepText}</div>` : ''}
      ${saleText ? `<div>${saleText}</div>` : ''}
      ${harvestStatus ? `<div${harvestStatus.blocked ? ' class="hp-disabled"' : ''}>${harvestStatus.text}</div>` : ''}
      ${wellText ? `<div>${wellText}</div>` : ''}
      ${gravelText ? `<div>${gravelText}</div>` : ''}
      ${rockText ? `<div>${rockText}</div>` : ''}
      ${cropWaterText ? `<div>${cropWaterText}</div>` : ''}
      ${waterTowerText ? `<div>${waterTowerText}</div>` : ''}
      ${houseTierText ? `<div>${houseTierText}</div>` : ''}
      ${houseNeedsText ? `<div>${houseNeedsText}</div>` : ''}
      ${houseProgressText ? `<div>${houseProgressText}</div>` : ''}
      ${houseDecayWarningText ? `<div class="house-tier-decay-warning">${houseDecayWarningText}</div>` : ''}
      ${houseChurchText ? `<div>${houseChurchText}</div>` : ''}
      ${churchClergyText ? `<div>${churchClergyText}</div>` : ''}
      ${churchRadiusText ? `<div>${churchRadiusText}</div>` : ''}
      ${inputText ? `<div>Consumes: ${inputText}</div>` : ''}
      ${outputText ? `<div>Produces: ${outputText}</div>` : ''}
      ${sellHintText ? `<div class="sell-hint">${sellHintText}</div>` : ''}
      ${adjacencyText ? `<div>${adjacencyText}</div>` : ''}
      ${nuisanceText ? `<div>${nuisanceText}</div>` : ''}
      ${workersText ? `<div>${workersText}</div>` : ''}
      ${understaffedText ? `<div class="hp-disabled">${understaffedText}</div>` : ''}
      ${animalText ? `<div>${animalText}</div>` : ''}
      ${enclosureStatusText ? `<div>${enclosureStatusText}</div>` : ''}
      ${cowboyText ? `<div>${cowboyText}</div>` : ''}
      ${brawlerText ? `<div>${brawlerText}</div>` : ''}
      ${dynamiterText ? `<div>${dynamiterText}</div>` : ''}
      ${mountedCowboyText ? `<div>${mountedCowboyText}</div>` : ''}
      ${trainingQueueText ? `<div>${trainingQueueText}</div>` : ''}
      ${rallyPointText ? `<div>${rallyPointText}</div>` : ''}
      ${balanceText ? `<div>${balanceText}</div>` : ''}
      ${gateStatusText ? `<div>${gateStatusText}</div>` : ''}
      ${ladyText ? `<div>${ladyText}</div>` : ''}
      ${brothelIncomeText ? `<div>${brothelIncomeText}</div>` : ''}
    `;

    if (isDamaged) {
      this.renderRepairButton(this.selected);
    }
    if (isHouse) {
      this.renderHouseTierTabs(this.selected);
    }
    if (isWoodenGate) {
      this.renderGateToggleButton(this.selected);
    }
    if (animalConfig) {
      this.renderBuyAnimalButton(this.selected, animalConfig);
    }
    if (isBarracks) {
      this.renderTrainCowboyButton(this.selected);
      this.renderTrainBrawlerButton(this.selected);
      this.renderTrainDynamiterButton(this.selected);
    }
    if (isHorsery) {
      this.renderTrainMountedCowboyButton(this.selected);
    }
    if (isBarracks || isHorsery) {
      this.renderRallyPointControls(this.selected);
    }
    if (isBank) {
      this.renderDepositButton(this.selected);
      this.renderWithdrawButton(this.selected);
    }
    if (isChurch) {
      this.renderHireNunButton(this.selected);
      this.renderHirePriestButton(this.selected);
    }
    if (isBrothel) {
      this.renderHireLadyButton(this.selected);
    }
    if (isTradingPost) {
      this.renderTradeOrderRows(this.selected);
    }
    if (workersRequired > 0) {
      this.renderPriorityControls(this.selected);
    }
    this.renderDemolishButton(this.selected);
  }

  /**
   * Phase 42: "why is this one empty" reason shared by every staffing status
   * line (plain production, harvesters, Barracks/Horsery/Bank/Watchtower,
   * Supermarket/Saloon sales) so the wording doesn't have to be kept in sync
   * by hand across all of them. Once the town-wide pool is actually short
   * (getLaborShortfall), that's the real, actionable reason regardless of
   * which building is asking; otherwise fall back to this building's own
   * assigned/required counts (e.g. immediately after placement, before the
   * next tick's assignWorkforce has run at all).
   */
  private formatUnderstaffedReason(building: PlacedBuilding, workersRequired: number): string {
    const shortfall = getLaborShortfall();
    if (shortfall > 0) {
      return `not enough population (need ${shortfall} more worker${shortfall === 1 ? '' : 's'} town-wide)`;
    }
    return `understaffed (${building.assignedWorkers}/${workersRequired} workers)`;
  }

  /** Phase 46: "Tier 2/3 | Population +4 | Tax +$2/tick" - Tier 1 has no tax, so that clause is omitted rather than shown as "+$0/tick". */
  private formatHouseTierText(building: PlacedBuilding): string {
    const tierConfig = HOUSE_TIER_CONFIG[building.houseTier];
    const taxPart = tierConfig.taxPerTick > 0 ? ` | Tax: +$${tierConfig.taxPerTick}/tick` : '';
    return `Tier ${building.houseTier}/3 | Population: +${tierConfig.population}${taxPart}`;
  }

  /** Phase 46: "Needs: Water OK, Meat or Eggs MISSING" - built from the exact per-group snapshot runHouseNeeds wrote last tick, so it can never disagree with what was actually consumed/taxed. */
  private formatHouseNeedsText(building: PlacedBuilding): string {
    if (building.houseNeedsStatus.length === 0) {
      return 'Needs: checking...';
    }
    const parts = building.houseNeedsStatus.map((need) => `${need.label} ${need.met ? 'OK' : 'MISSING'}`);
    return `Needs: ${parts.join(', ')}`;
  }

  /**
   * Phase 46: surfaces the hysteresis counter that's actually moving, so the
   * player can see a tier change coming rather than have it happen silently.
   * Never shows both directions at once - runHouseNeeds always zeroes the
   * other streak on every tick, met or not.
   */
  private formatHouseProgressText(building: PlacedBuilding): string | null {
    if (building.houseTier < 3 && building.houseNeedsMetStreak > 0) {
      return `Upgrading in ${HOUSE_TIER_HYSTERESIS_TICKS - building.houseNeedsMetStreak} tick(s)...`;
    }
    if (building.houseTier > 1 && building.houseNeedsUnmetStreak > 0) {
      return `Downgrade risk: ${HOUSE_TIER_HYSTERESIS_TICKS - building.houseNeedsUnmetStreak} tick(s) left`;
    }
    return null;
  }

  /**
   * Phase 62: a louder, harder-to-miss line once the unmet streak has eaten a
   * significant chunk of the hysteresis budget - formatHouseProgressText
   * already shows the exact countdown, but a plain "5 tick(s) left" line
   * blends into the rest of the panel. Threshold is half the hysteresis
   * window: simple, and still gives the player real time to react once it
   * appears (at HOUSE_TIER_HYSTERESIS_TICKS=75, that's the last ~37 ticks,
   * ~74s of an in-progress downgrade).
   */
  private formatHouseDecayWarning(building: PlacedBuilding): string | null {
    if (building.houseTier <= 1 || building.houseNeedsUnmetStreak <= 0) {
      return null;
    }
    const halfway = Math.ceil(HOUSE_TIER_HYSTERESIS_TICKS / 2);
    if (building.houseNeedsUnmetStreak < halfway) {
      return null;
    }
    return `Needs unmet for ${building.houseNeedsUnmetStreak}/${HOUSE_TIER_HYSTERESIS_TICKS} ticks - tier will drop soon`;
  }

  /**
   * Phase 70: a House's Church-coverage line - deliberately separate from
   * formatHouseNeedsText (Church isn't a ResourceKey/HouseNeedGroup) and from
   * the per-tier tab strip's need display. Only shown when Church coverage is
   * actually relevant right now: the House's CURRENT tier requires one (so
   * losing coverage risks a downgrade), or the NEXT tier it could grow into
   * will (so an as-yet-unserved Tier 1 House knows a Church is coming).
   * Tier 3 with no next tier still shows via the current-tier branch.
   */
  private formatHouseChurchText(building: PlacedBuilding): string | null {
    const tierConfig = HOUSE_TIER_CONFIG[building.houseTier];
    const nextTier = building.houseTier < 3 ? ((building.houseTier + 1) as HouseTier) : null;
    const nextTierConfig = nextTier !== null ? HOUSE_TIER_CONFIG[nextTier] : null;

    if (tierConfig.requiresChurch) {
      const served = isServedByChurch(building);
      const distance = getNearestChurchDistance(building);
      if (served && distance !== null) {
        return `Church: Served (Church ${distance} tile${distance === 1 ? '' : 's'} away)`;
      }
      return 'Church: Not served - needs a Church within range';
    }

    if (nextTierConfig?.requiresChurch) {
      const served = isServedByChurch(building);
      return served
        ? 'Church: Served (ready for Tier growth)'
        : `Church: Not served yet - Tier ${nextTier} will require a nearby staffed Church`;
    }

    return null;
  }

  /**
   * Phase 62: Tier 1/2/3 tab strip. The active tier's tab always mirrors
   * building.houseTier (so switching tabs never looks like it changed the
   * building's real tier), independent of which tab the player currently has
   * open (this.viewedHouseTier) for reading. Clicking a tab just changes what
   * this.renderHouseTierDetail below reads next render - it never mutates
   * game state.
   */
  private renderHouseTierTabs(building: PlacedBuilding): void {
    const viewed = this.viewedHouseTier ?? building.houseTier;

    const tabs = document.createElement('div');
    tabs.className = 'house-tier-tabs';
    const label = document.createElement('span');
    label.textContent = 'View: ';
    tabs.appendChild(label);

    for (const tier of [1, 2, 3] as HouseTier[]) {
      const button = document.createElement('button');
      button.className = `house-tier-tab${viewed === tier ? ' active' : ''}`;
      button.textContent = `Tier ${tier}${tier === building.houseTier ? ' (current)' : ''}`;
      button.addEventListener('click', () => {
        this.viewedHouseTier = tier;
        this.render();
      });
      tabs.appendChild(button);
    }
    this.panel.appendChild(tabs);

    this.renderHouseTierDetail(building, viewed);
  }

  /**
   * Phase 62: the selected tab's need list, population grant and tax. For the
   * building's actual current tier, each need also gets a live OK/MISSING
   * badge straight off houseNeedsStatus (the exact snapshot runHouseNeeds
   * wrote last tick) - for any other tier, badges are omitted entirely rather
   * than guessed, since the building isn't running that tier's consumption
   * logic and a fake live check would misrepresent what's actually happening.
   */
  private renderHouseTierDetail(building: PlacedBuilding, tier: HouseTier): void {
    const tierConfig = HOUSE_TIER_CONFIG[tier];
    const isCurrentTier = tier === building.houseTier;

    const detail = document.createElement('div');
    detail.className = 'house-tier-detail';

    const summary = document.createElement('div');
    const taxPart = tierConfig.taxPerTick > 0 ? ` | Tax: +$${tierConfig.taxPerTick}/tick` : ' | Tax: none';
    summary.textContent = `Population: +${tierConfig.population}${taxPart}`;
    detail.appendChild(summary);

    const liveStatusByLabel = isCurrentTier
      ? new Map(building.houseNeedsStatus.map((need) => [need.label, need.met]))
      : null;

    for (const group of tierConfig.needs) {
      const needLine = document.createElement('div');
      const amounts = (Object.entries(group.options) as [ResourceKey, number][])
        .map(([key, amount]) => `${RESOURCE_LABELS[key]} ${amount}/tick`)
        .join(' or ');
      const live = liveStatusByLabel?.get(group.label) ?? null;
      const badge = live === null ? '' : live ? ' - OK' : ' - MISSING';
      if (live !== null) {
        needLine.className = live ? 'house-tier-need-met' : 'house-tier-need-missing';
      }
      needLine.textContent = `${group.label}: ${amounts}${badge}`;
      detail.appendChild(needLine);
    }

    if (!isCurrentTier) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Reference only - not this House\'s current tier';
      detail.appendChild(hint);
    }

    this.panel.appendChild(detail);
  }

  /**
   * Phase 42: High/Normal/Low buttons for any building that competes for the
   * shared population pool. Clicking a tier calls setBuildingPriority and
   * re-renders immediately - the effect on actual staffing only shows up
   * after the next production tick's assignWorkforce pass, same as every
   * other action this panel drives.
   */
  private renderPriorityControls(building: PlacedBuilding): void {
    const row = document.createElement('div');
    row.className = 'priority-row';

    const label = document.createElement('span');
    label.textContent = 'Priority: ';
    row.appendChild(label);

    for (const priority of WORKER_PRIORITIES) {
      const button = document.createElement('button');
      button.className = `priority-button${building.priority === priority ? ' active' : ''}`;
      button.textContent = priority.charAt(0).toUpperCase() + priority.slice(1);
      button.addEventListener('click', () => {
        setBuildingPriority(building.id, priority);
        this.render();
      });
      row.appendChild(button);
    }

    this.panel.appendChild(row);
  }

  /**
   * Phase 51: Trading Post. One row per marketable resource: a toggle button
   * ("Off"/"Auto-sell"), a threshold number input ("above") and an amount
   * number input ("up to N/tick"), plus the resource's live market price so
   * the player can see what they'd actually be selling at. The two number
   * inputs use 'change' (fires on blur/Enter), not 'input' - re-rendering the
   * whole panel on every keystroke (this.render(), like every other control
   * in this file) would steal focus mid-type.
   */
  private renderTradeOrderRows(building: PlacedBuilding): void {
    const header = document.createElement('div');
    header.textContent = 'Trade Orders:';
    this.panel.appendChild(header);

    for (const key of MARKETABLE_RESOURCE_KEYS) {
      this.panel.appendChild(this.buildTradeOrderRow(building, key));
    }
  }

  private buildTradeOrderRow(building: PlacedBuilding, key: MarketableResourceKey): HTMLDivElement {
    const order: TradeOrderConfig = building.tradeOrders[key] ?? {
      enabled: false,
      threshold: TRADING_POST_DEFAULT_THRESHOLD,
      amount: TRADING_POST_DEFAULT_AMOUNT,
    };

    const row = document.createElement('div');
    row.className = 'trade-order-row';

    const toggle = document.createElement('button');
    toggle.className = `priority-button${order.enabled ? ' active' : ''}`;
    toggle.textContent = order.enabled ? 'Auto-sell' : 'Off';
    toggle.title = `${RESOURCE_LABELS[key]} ($${Math.round(getCurrentMarketPrice(key) * 100) / 100})`;
    toggle.addEventListener('click', () => {
      setTradingPostOrder(building.id, key, { enabled: !order.enabled });
      this.render();
    });
    row.appendChild(toggle);

    const label = document.createElement('span');
    label.textContent = RESOURCE_LABELS[key];
    row.appendChild(label);

    const thresholdInput = document.createElement('input');
    thresholdInput.type = 'number';
    thresholdInput.min = '0';
    thresholdInput.className = 'trade-order-input';
    thresholdInput.title = 'Sell only once stock is above this amount';
    thresholdInput.value = `${order.threshold}`;
    thresholdInput.addEventListener('change', () => {
      const threshold = Math.max(0, Number(thresholdInput.value) || 0);
      setTradingPostOrder(building.id, key, { threshold });
      this.render();
    });
    row.appendChild(thresholdInput);

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.min = '0';
    amountInput.className = 'trade-order-input';
    amountInput.title = 'Max sold per tick';
    amountInput.value = `${order.amount}`;
    amountInput.addEventListener('change', () => {
      const amount = Math.max(0, Number(amountInput.value) || 0);
      setTradingPostOrder(building.id, key, { amount });
      this.render();
    });
    row.appendChild(amountInput);

    return row;
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
        text: `Not harvesting: ${this.formatUnderstaffedReason(building, required)}`,
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

  /**
   * Real Fence Enclosures: replaces the old single-tile "requires an adjacent
   * Fence" reason with the specific enclosure problem, checked in the same
   * priority order getEnclosureBuyStatus/buyAnimal actually gate on - cap
   * first (no enclosure math is even relevant once full), then the
   * enclosure's own validity (open / too small), then affordability last.
   *
   * Item 4 (2026-09-07): dropped the Gate-count branches ("no Gate" / "N
   * Gates, need exactly one") now that isEnclosureValid no longer checks
   * gateCount at all - a closed perimeter with insufficient area now falls
   * straight through to the "too small" branch regardless of how many Gates
   * (if any) it has.
   */
  private renderBuyAnimalButton(building: PlacedBuilding, animalConfig: AnimalConfig): void {
    const atCap = building.animalCount >= animalConfig.maxAnimals;
    const buyStatus = getEnclosureBuyStatus(building);

    const enclosureReason = (): string | null => {
      if (!buyStatus.enclosure || !buyStatus.enclosure.closed) {
        return 'enclosure not closed (build a complete Fence perimeter)';
      }
      if (buyStatus.enclosure.enclosedTileCount < buyStatus.requiredArea) {
        const short = buyStatus.requiredArea - buyStatus.enclosure.enclosedTileCount;
        return `enclosure too small (need ${short} more tile${short === 1 ? '' : 's'})`;
      }
      return null;
    };

    const blockReason = atCap
      ? 'at max animals'
      : !buyStatus.valid
        ? enclosureReason()
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

  /**
   * Real Fence Enclosures: shown alongside the Buy button for any farm -
   * open/closed and enclosed area vs. what the NEXT purchase needs.
   *
   * Item 3 (2026-09-07): the open branch now also reports enclosedTileCount
   * (always 0 while open - the flood-fill never resolves an area for a
   * non-closed result - but stated explicitly rather than omitted, so the
   * line's shape is consistent whether or not the pen is closed). Item 4
   * (2026-09-07): dropped the Gate-count branch entirely - Gate no longer
   * factors into validity, so there is nothing left to report about it here.
   */
  private formatEnclosureStatusText(building: PlacedBuilding, animalConfig: AnimalConfig): string {
    const status = getEnclosureBuyStatus(building);
    if (!status.enclosure || !status.enclosure.closed) {
      return 'Enclosure: Open - not enclosed (0 tiles)';
    }
    return `Enclosure: Closed, ${status.enclosure.enclosedTileCount} tiles (need ${status.requiredArea} for next ${animalConfig.animalLabel})`;
  }

  private renderTrainCowboyButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0
        ? 'disabled'
        : building.cowboyCount + building.trainingQueue.length >= COWBOY_MAX_PER_BARRACKS
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
        : building.mountedCowboyCount + building.trainingQueue.length >= MOUNTED_COWBOY_MAX_PER_HORSERY
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

  /**
   * Phase 58: training a Brawler also costs BRAWLER_TRAIN_MATERIALS (Tools) on
   * top of money, so it gets its own resources-affordability check that
   * trainCowboy/trainMountedCowboy don't need. Mirrors renderTrainCowboyButton
   * otherwise.
   */
  private renderTrainBrawlerButton(building: PlacedBuilding): void {
    const resources = getResources();
    const lacksMaterials = (Object.entries(BRAWLER_TRAIN_MATERIALS) as [ResourceKey, number][]).some(
      ([key, amount]) => resources[key] < amount,
    );
    const blockReason =
      building.hp <= 0
        ? 'disabled'
        : building.brawlerCount + building.trainingQueue.length >= BRAWLER_MAX_PER_BARRACKS
          ? 'at max brawlers'
          : getMoney() < BRAWLER_TRAIN_COST
            ? "can't afford"
            : lacksMaterials
              ? 'not enough materials'
              : null;

    const button = document.createElement('button');
    button.textContent = `Train Brawler ($${BRAWLER_TRAIN_COST} + ${this.formatResourceMap(BRAWLER_TRAIN_MATERIALS)})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      trainBrawler(building.id);
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

  /** Mirrors renderTrainBrawlerButton exactly, gated on DYNAMITER_MAX_PER_BARRACKS/DYNAMITER_TRAIN_COST/DYNAMITER_TRAIN_MATERIALS instead. */
  private renderTrainDynamiterButton(building: PlacedBuilding): void {
    const resources = getResources();
    const lacksMaterials = (Object.entries(DYNAMITER_TRAIN_MATERIALS) as [ResourceKey, number][]).some(
      ([key, amount]) => resources[key] < amount,
    );
    const blockReason =
      building.hp <= 0
        ? 'disabled'
        : building.dynamiterCount + building.trainingQueue.length >= DYNAMITER_MAX_PER_BARRACKS
          ? 'at max dynamiters'
          : getMoney() < DYNAMITER_TRAIN_COST
            ? "can't afford"
            : lacksMaterials
              ? 'not enough materials'
              : null;

    const button = document.createElement('button');
    button.textContent = `Train Dynamiter ($${DYNAMITER_TRAIN_COST} + ${this.formatResourceMap(DYNAMITER_TRAIN_MATERIALS)})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      trainDynamiter(building.id);
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

  /**
   * Phase 70: hiring clergy is instant (no training queue - see
   * gameState.hireNun's doc comment), so the disabled-reason set is a subset
   * of the Barracks/Horsery train-button pattern above: no "at max" needs a
   * trainingQueue.length term since there's no queue to be mid-way through.
   */
  private renderHireNunButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0 || building.disabled
        ? 'disabled'
        : (building.nunCount ?? 0) + (building.priestCount ?? 0) >= CHURCH_MAX_CLERGY
          ? 'at max clergy'
          : getMoney() < CHURCH_NUN_COST
            ? "can't afford"
            : null;

    const button = document.createElement('button');
    button.textContent = `Hire Nun ($${CHURCH_NUN_COST})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      hireNun(building.id);
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

  /** Mirrors renderHireNunButton exactly, gated on CHURCH_PRIEST_COST instead. */
  private renderHirePriestButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0 || building.disabled
        ? 'disabled'
        : (building.nunCount ?? 0) + (building.priestCount ?? 0) >= CHURCH_MAX_CLERGY
          ? 'at max clergy'
          : getMoney() < CHURCH_PRIEST_COST
            ? "can't afford"
            : null;

    const button = document.createElement('button');
    button.textContent = `Hire Priest ($${CHURCH_PRIEST_COST})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      hirePriest(building.id);
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

  /**
   * Phase 72: hiring a lady is instant (no training queue), exactly mirroring
   * renderHireNunButton/renderHirePriestButton's shape and disabled-reason set.
   */
  private renderHireLadyButton(building: PlacedBuilding): void {
    const blockReason =
      building.hp <= 0 || building.disabled
        ? 'disabled'
        : (building.ladyCount ?? 0) >= BROTHEL_MAX_LADIES
          ? 'at max ladies'
          : getMoney() < BROTHEL_LADY_COST
            ? "can't afford"
            : null;

    const button = document.createElement('button');
    button.textContent = `Hire Lady ($${BROTHEL_LADY_COST})`;
    button.disabled = blockReason !== null;
    button.addEventListener('click', () => {
      hireLady(building.id);
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

  /**
   * Phase 72: live "Serving N Houses -> +$X.X/tick" readout sourced from last
   * tick's runBrothelIncome result, mirroring formatSaleText's shape/priority
   * order (a real result first, then why there isn't one). lastBrothelIncome
   * is undefined until the first production tick after placement, matching
   * lastSale/lastHarvest's "absent means not yet meaningful" convention.
   */
  private formatBrothelIncomeText(building: PlacedBuilding, workersRequired: number): string {
    const result = building.lastBrothelIncome;
    if (result && result.income > 0) {
      return `Serving ${result.housesServed} House${result.housesServed === 1 ? '' : 's'} -> +$${result.income.toFixed(1)}/tick`;
    }
    if (!building.staffed) {
      return `Not earning - ${this.formatUnderstaffedReason(building, workersRequired)}`;
    }
    if ((building.ladyCount ?? 0) <= 0) {
      return 'Not earning - no ladies hired';
    }
    if (result && result.housesServed === 0) {
      return `Not earning - no Houses within ${BROTHEL_SERVICE_RADIUS_TILES} tiles`;
    }
    return 'Not earning - no Houses in range';
  }

  /**
   * Phase 53: "Cowboy (2 ticks left), Cowboy (5 ticks left)" - only the front
   * job's remainingTicks actually counts down (gameState.runTrainingQueues),
   * so every later job in the list still shows its full COWBOY_TRAIN_TICKS/
   * MOUNTED_COWBOY_TRAIN_TICKS/BRAWLER_TRAIN_TICKS/DYNAMITER_TRAIN_TICKS seed
   * until its turn comes. Phase 58: label now comes from the shared
   * UNIT_KIND_LABELS lookup instead of a two-way ternary, since a Barracks
   * queue can now mix three kinds.
   */
  private formatTrainingQueueText(building: PlacedBuilding): string | null {
    if (building.trainingQueue.length === 0) {
      return null;
    }
    const parts = building.trainingQueue.map((job) => {
      const label = UNIT_KIND_LABELS[job.kind];
      return `${label} (${job.remainingTicks} tick${job.remainingTicks === 1 ? '' : 's'} left)`;
    });
    return `Training: ${parts.join(', ')}`;
  }

  /**
   * Phase 53: "Set Rally Point" arms MainScene's one-shot next-right-click
   * interception (see gameEvents' 'rally-point-mode-changed' doc comment);
   * clicking it again while already armed for this exact building disarms it
   * instead, so the button doubles as its own cancel. "Clear Rally Point"
   * only appears once one is actually set.
   */
  private renderRallyPointControls(building: PlacedBuilding): void {
    const isArmed = this.rallyPointArmedFor === building.id;

    const setButton = document.createElement('button');
    setButton.textContent = isArmed ? 'Cancel Rally Point Pick' : 'Set Rally Point';
    setButton.addEventListener('click', () => {
      gameEvents.emit('rally-point-mode-changed', isArmed ? null : building.id);
    });
    this.panel.appendChild(setButton);

    if (isArmed) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Right-click the ground to place it';
      this.panel.appendChild(hint);
    }

    if (building.rallyPoint) {
      const clearButton = document.createElement('button');
      clearButton.textContent = 'Clear Rally Point';
      clearButton.addEventListener('click', () => {
        clearRallyPoint(building.id);
        this.render();
      });
      this.panel.appendChild(clearButton);
    }
  }

  /**
   * Phase 69: a single toggle button, label reflecting the CURRENT state and
   * the action clicking it takes (matching renderRallyPointControls' own
   * "Set"/"Cancel" toggle-label convention above) - calls setGateOpen, which
   * recomputes any nearby farm's enclosure BEFORE firing 'gate-state-changed'
   * (see that function's doc comment), so this.render() below always reflects
   * the already-fresh enclosure state, never a stale one.
   */
  private renderGateToggleButton(building: PlacedBuilding): void {
    const isOpen = building.gateOpen !== false;
    const button = document.createElement('button');
    button.textContent = isOpen ? 'Close Gate' : 'Open Gate';
    button.disabled = building.hp <= 0;
    button.addEventListener('click', () => {
      setGateOpen(building.id, !isOpen);
      this.render();
    });
    this.panel.appendChild(button);
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

  private formatSaleText<K extends ResourceKey>(
    sale: AutoSale<K> | undefined,
    building: PlacedBuilding,
    workersRequired: number,
  ): string {
    const soldEntries = sale
      ? (Object.entries(sale.sold) as [K, number][]).filter(([, amount]) => amount > 0)
      : [];
    if (sale && soldEntries.length > 0) {
      const parts = soldEntries.map(([key, amount]) => `${amount} ${RESOURCE_LABELS[key]}`);
      return `Sold: ${parts.join(', ')} -> +$${sale.revenue}`;
    }
    if (!building.staffed) {
      return `Not selling (${this.formatUnderstaffedReason(building, workersRequired)})`;
    }
    return 'No stock to sell';
  }

  /**
   * Phase 93: for a building that makes something, where its output turns
   * into money - or, just as important, that it does NOT and is only useful
   * as an input to another building. Covers all three ways a building can
   * produce (production.outputs, an AnimalConfig, a HarvestConfig), since a
   * Chicken Farm declares an empty `production` block and makes everything
   * through its animals.
   */
  /**
   * Phase 95: the live district-synergy readout for a consumer building -
   * which of its inputs have a producer within ADJACENCY_RADIUS_TILES, what
   * the resulting output bonus is, and (when something is missing) exactly
   * which input to build nearer. Returns null for a building with no
   * production inputs, where the whole mechanic doesn't apply.
   */
  private formatAdjacencyText(building: PlacedBuilding): string | null {
    const status = getAdjacencyStatus(building.tileX, building.tileY, building.type, building.id);
    if (status.suppliedInputs.length === 0 && status.missingInputs.length === 0) {
      return null;
    }
    const percent = Math.round((status.multiplier - 1) * 100);
    if (status.suppliedInputs.length === 0) {
      return `Supply chain: no bonus - no producer of ${status.missingInputs
        .map((key) => RESOURCE_LABELS[key])
        .join(' or ')} within ${ADJACENCY_RADIUS_TILES} tiles`;
    }
    const supplied = status.suppliedInputs.map((key) => RESOURCE_LABELS[key]).join(', ');
    const missing =
      status.missingInputs.length > 0
        ? ` (still far from ${status.missingInputs.map((key) => RESOURCE_LABELS[key]).join(', ')})`
        : '';
    return `Supply chain: +${percent}% output - ${supplied} produced nearby${missing}`;
  }

  /** Phase 95: the House side of the same trade-off - heavy industry next door cuts the tax it pays. */
  private formatNuisanceText(building: PlacedBuilding): string | null {
    if (building.type !== BuildingType.House) {
      return null;
    }
    const nuisance = getIndustryNuisance(building.tileX, building.tileY, building.type, building.id);
    if (nuisance.sources === 0) {
      return null;
    }
    const percent = Math.round(nuisance.taxPenaltyFraction * 100);
    const net = building.lastHouseTax ? ` (now $${building.lastHouseTax.net}/tick)` : '';
    return `Industry nearby: ${nuisance.sources} within ${INDUSTRY_NUISANCE_RADIUS_TILES} tiles - tax -${percent}%${net}`;
  }

  private formatSellHint(type: BuildingType): string | null {
    const definition = BUILDING_DEFINITIONS[type];
    const outputKeys = new Set<ResourceKey>([
      ...(Object.keys(definition.production?.outputs ?? {}) as ResourceKey[]),
      ...(Object.keys(definition.animal?.outputPerAnimal ?? {}) as ResourceKey[]),
      ...(Object.keys(definition.harvest?.outputs ?? {}) as ResourceKey[]),
    ]);
    if (outputKeys.size === 0) {
      return null;
    }

    const sellable: string[] = [];
    const unsellable: string[] = [];
    for (const key of outputKeys) {
      const outlets: string[] = [];
      for (const [sellerType, rates] of Object.entries(FIXED_RATE_SELL_TABLES) as [
        BuildingType,
        Record<string, { amount: number; price: number }>,
      ][]) {
        if (rates[key]) {
          outlets.push(BUILDING_DEFINITIONS[sellerType].label);
        }
      }
      if (outlets.length > 0) {
        sellable.push(`${RESOURCE_LABELS[key]} at ${outlets.join('/')}`);
      } else {
        // Name the consumer chain instead, so "no buyer" is actionable
        // rather than just discouraging.
        const users = getResourceConsumers(key)
          .filter((consumerType) => consumerType !== type)
          .map((consumerType) => BUILDING_DEFINITIONS[consumerType].label);
        unsellable.push(
          users.length > 0
            ? `${RESOURCE_LABELS[key]} (no buyer - feeds ${users.join('/')})`
            : `${RESOURCE_LABELS[key]} (no buyer yet)`,
        );
      }
    }

    const parts = [...sellable, ...unsellable];
    return `Sell: ${parts.join('; ')}`;
  }

  private formatResourceMap(map: Partial<Record<ResourceKey, number>>): string {
    return (Object.entries(map) as [ResourceKey, number][])
      .map(([key, amount]) => `${Math.round(amount * 10) / 10} ${RESOURCE_LABELS[key]}`)
      .join(', ');
  }
}
