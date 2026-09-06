import {
  BANK_INTEREST_RATE,
  BRAWLER_MAX_PER_BARRACKS,
  BRAWLER_TRAIN_COST,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_TRAIN_COST,
  DYNAMITER_MAX_PER_BARRACKS,
  DYNAMITER_TRAIN_COST,
  GRAVEL_MAX_DISTANCE_TILES,
  MOUNTED_COWBOY_MAX_PER_HORSERY,
  MOUNTED_COWBOY_TRAIN_COST,
  POPULATION_PER_HOUSE,
  WATCHTOWER_DAMAGE,
  WATCHTOWER_RANGE_TILES,
  WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES,
  WATER_TOWER_IRRIGATION_RADIUS_TILES,
  WELL_MAX_WATER_DISTANCE_TILES,
} from './constants';
import { VegetationKind } from './vegetationConfig';

export enum BuildingType {
  CattleFarm = 'CattleFarm',
  Butcher = 'Butcher',
  Well = 'Well',
  House = 'House',
  Road = 'Road',
  ChickenFarm = 'ChickenFarm',
  PigFarm = 'PigFarm',
  CowRanch = 'CowRanch',
  Fence = 'Fence',
  Warehouse = 'Warehouse',
  Supermarket = 'Supermarket',
  Barracks = 'Barracks',
  Sewery = 'Sewery',
  Forestry = 'Forestry',
  WoodCutter = 'WoodCutter',
  PotatoField = 'PotatoField',
  Liquor = 'Liquor',
  Saloon = 'Saloon',
  Horsery = 'Horsery',
  Bank = 'Bank',
  CactusMilker = 'CactusMilker',
  Watchtower = 'Watchtower',
  Quarry = 'Quarry',
  IronMine = 'IronMine',
  Blacksmith = 'Blacksmith',
  TradingPost = 'TradingPost',
  WaterTower = 'WaterTower',
}

/**
 * Phase 33: grouping for the categorized building bar. Purely a UI concern
 * (the bar's tabs) - nothing in the simulation reads it - but it lives on the
 * definition so a new building type can never be added without deciding where
 * it belongs in the menu.
 */
export enum BuildingCategory {
  Infrastructure = 'Housing & Infra',
  Livestock = 'Livestock',
  Farming = 'Farming & Forestry',
  Industry = 'Industry',
  Commerce = 'Commerce',
  Military = 'Military',
}

export interface BuildingSize {
  width: number;
  height: number;
}

export type ResourceKey =
  | 'rawMeat'
  | 'meat'
  | 'water'
  | 'eggs'
  | 'leather'
  | 'clothes'
  | 'logs'
  | 'wood'
  | 'potatoes'
  | 'liquor'
  | 'agaveJuice'
  | 'stone'
  | 'iron'
  | 'tools';

/**
 * Phase 32: per-unit cash value used to price the resource stock inside net
 * worth (the replacement for the old meat-only score). Roughly tracks each
 * good's sell price where one exists, and its chain depth where it doesn't.
 */
export const RESOURCE_VALUES: Record<ResourceKey, number> = {
  rawMeat: 2,
  meat: 5,
  water: 1,
  eggs: 3,
  leather: 4,
  clothes: 15,
  logs: 2,
  wood: 3,
  potatoes: 2,
  liquor: 12,
  agaveJuice: 6,
  // Phase 50: stone/iron are cheap raw extraction (same tier as logs/potatoes);
  // tools is the chain's tier-3 manufactured good, priced above every other
  // sellable resource since it also doubles as a building material.
  stone: 3,
  iron: 6,
  tools: 20,
};

export interface BuildingProduction {
  inputs?: Partial<Record<ResourceKey, number>>;
  outputs?: Partial<Record<ResourceKey, number>>;
}

/** The three critter sprites drawn in BootScene; matches every AnimalConfig.animalLabel in use. */
export type AnimalKind = 'Chicken' | 'Pig' | 'Cow';

/**
 * Livestock buildings own animals instead of producing a flat rate: output
 * per tick is `outputPerAnimal * animalCount`, so an empty building makes
 * nothing until the player buys stock (buyAnimal in gameState.ts).
 */
export interface AnimalConfig {
  animalLabel: AnimalKind;
  costPerAnimal: number;
  maxAnimals: number;
  outputPerAnimal: Partial<Record<ResourceKey, number>>;
}

/**
 * Phase 32: a building that draws its output from real vegetation entities
 * standing near it (Forestry -> Trees, Cactus Milker -> Cacti) instead of
 * conjuring it from nothing. Each tick it consumes `yieldPerTick` from the
 * nearest matching entity inside `radiusTiles` and emits `outputs` scaled by
 * however much it actually managed to take - so a cleared-out radius means no
 * output at all until something regrows.
 */
export interface HarvestConfig {
  kind: VegetationKind;
  radiusTiles: number;
  yieldPerTick: number;
  outputs: Partial<Record<ResourceKey, number>>;
  /** Chance per tick to replant one entity of `kind` inside the radius (Forestry only). */
  replantChancePerTick?: number;
}

export type HouseTier = 1 | 2 | 3;

/**
 * Phase 46: one "or" group of a House tier's resource needs - e.g. Tier 2's
 * second need is satisfied by *either* Meat or Eggs, not both. runHouseNeeds
 * (gameState.ts) tries each key in `options`'s declaration order and consumes
 * the first one the pool can afford; `label` is purely for the info panel
 * ("Needs: Water OK, Meat or Eggs MISSING").
 */
export interface HouseNeedGroup {
  label: string;
  options: Partial<Record<ResourceKey, number>>;
}

export interface HouseTierConfig {
  tier: HouseTier;
  /** Workforce this tier's House contributes to the town-wide population pool. */
  population: number;
  /** Money collected into the town's pool per tick once this tier's needs are met (0 for Tier 1). */
  taxPerTick: number;
  needs: HouseNeedGroup[];
}

/**
 * Phase 46: Population Needs & House Tiers. A House starts at Tier 1 (just
 * needs a trickle of Water, like every other early building) and climbs to
 * Tier 2/3 by keeping its growing resource needs satisfied for
 * HOUSE_TIER_HYSTERESIS_TICKS consecutive ticks (see runHouseNeeds); losing
 * the ability to pay a tier's needs for the same number of consecutive ticks
 * drops it back down one tier. Numbers are kept modest against real
 * production rates seen elsewhere in this file: a single staffed Chicken Farm
 * (4 chickens @ 0.2 eggs/tick = 0.8/tick) alone covers 8 Tier-2/3 houses'
 * Meat-or-Eggs need, and a single Sewery/Liquor Still's typical output
 * (bottlenecked by Leather/Potato supply to well under 1/tick) covers roughly
 * 10-6 Tier-3 houses' Clothes-or-Liquor need - satisfiable by a
 * reasonably-developed economy, not trivial and not a brick wall.
 */
export const HOUSE_TIER_CONFIG: Record<HouseTier, HouseTierConfig> = {
  1: {
    tier: 1,
    population: POPULATION_PER_HOUSE,
    taxPerTick: 0,
    needs: [{ label: 'Water', options: { water: 0.2 } }],
  },
  2: {
    tier: 2,
    population: 4,
    taxPerTick: 2,
    needs: [
      { label: 'Water', options: { water: 0.3 } },
      { label: 'Meat or Eggs', options: { meat: 0.1, eggs: 0.1 } },
    ],
  },
  3: {
    tier: 3,
    population: 6,
    taxPerTick: 5,
    needs: [
      { label: 'Water', options: { water: 0.4 } },
      { label: 'Meat or Eggs', options: { meat: 0.15, eggs: 0.15 } },
      { label: 'Clothes or Liquor', options: { clothes: 0.05, liquor: 0.1 } },
    ],
  },
};

/**
 * Phase 47: Milestone-Gated Building Unlocks. Every field is an "at least"
 * floor, all present fields must hold simultaneously (isBuildingUnlocked in
 * gameState.ts ANDs them), and an entirely undefined `unlockRequirement`
 * means always-unlocked - kept on the six buildings a brand-new player needs
 * immediately (House, Well, Road, Fence, CattleFarm, ChickenFarm) so the
 * opening minute is never gated on anything. `netWorthAtLeast` is checked
 * against computeNetWorth().total, which starts near STARTING_MONEY (1800) -
 * thresholds below that would be satisfied at t=0 and gate nothing, so every
 * net-worth-gated building here sits comfortably above it.
 */
export interface UnlockRequirement {
  populationAtLeast?: number;
  netWorthAtLeast?: number;
  dayAtLeast?: number;
}

export interface BuildingDefinition {
  type: BuildingType;
  label: string;
  cost: number;
  /**
   * Phase 37: optional material cost alongside `cost`'s money price - kept
   * optional (rather than a required, possibly-empty map) so every existing
   * money-only definition stays valid untouched. Walled production/commerce/
   * military buildings mostly cost Wood (creating real demand for the
   * WoodCutter chain); core early buildings (House/Well/Road/Fence/the raw
   * livestock & crop buildings/Forestry) stay material-free so the opening
   * game is never gated on a resource chain that doesn't exist yet.
   */
  materials?: Partial<Record<ResourceKey, number>>;
  size: BuildingSize;
  color: number;
  category: BuildingCategory;
  production?: BuildingProduction;
  /** Marks a non-production building (e.g. Warehouse) as still needing staff to function. */
  requiresWorkers?: boolean;
  animal?: AnimalConfig;
  harvest?: HarvestConfig;
  /** Starting/full hit points (Phase 21); tiered roughly by cost/footprint. */
  maxHp: number;
  /**
   * Phase 32: money drained per production tick while this building is
   * staffed and enabled. 0 for passive structures (Road/Fence) that cost
   * nothing to keep standing.
   */
  upkeep: number;
  /** Phase 47: undefined = always unlocked. See UnlockRequirement's doc comment for the full design. */
  unlockRequirement?: UnlockRequirement;
}

/**
 * Shared shape for an autonomous-sell building's last-tick result (Phase 14
 * Supermarket, Phase 27 Saloon): what got sold and the money it brought in.
 * Kept as one generic instead of two structurally-identical interfaces so
 * BuildingInfoPanel can render both with a single formatter.
 */
export interface AutoSale<K extends ResourceKey> {
  sold: Partial<Record<K, number>>;
  revenue: number;
}

export type SupermarketSale = AutoSale<SupermarketSellableKey>;
export type SaloonSale = AutoSale<SaloonSellableKey>;
/**
 * Phase 51: every resource sellable via either autonomous-sell table is also
 * tradeable through a Trading Post's manual per-resource orders - the two
 * existing rate tables double as this phase's price *baseline*, they aren't
 * replaced. See MARKETABLE_RESOURCE_KEYS/BASE_MARKET_PRICES further down this
 * file (declared after both tables) and state/market.ts for the fluctuating
 * price model itself.
 */
export type MarketableResourceKey = SupermarketSellableKey | SaloonSellableKey;
export type TradingPostSale = AutoSale<MarketableResourceKey>;

/**
 * Phase 51: one Trading Post row's manual configuration for a single
 * resource. `enabled` gates the whole order; `threshold` is the stock level
 * that must be exceeded before anything sells; `amount` caps how much sells
 * per tick once it does - the same "sell up to N/tick above threshold X"
 * shape the roadmap item asks for, just player-configured instead of a fixed
 * per-building-type rate table.
 */
export interface TradeOrderConfig {
  enabled: boolean;
  threshold: number;
  amount: number;
}

/**
 * Phase 42: player-controlled staffing order. assignWorkforce (gameState.ts)
 * processes every High-priority building before any Normal, and every Normal
 * before any Low, so a scarce population pool gets funneled to whichever
 * buildings the player flags as most important instead of whatever happened
 * to get placed first.
 */
export type WorkerPriority = 'high' | 'normal' | 'low';

/**
 * Phase 58: the discriminant shared by CombatUnit (MainScene.ts),
 * TrainingQueueJob.kind below and every per-kind PlacedBuilding field pair -
 * previously declared three times over (once inline in MainScene, once
 * inline in gameState's damageUnit, once inline here) and now consolidated to
 * this single exported type so a new kind only has to be added in one place.
 * Barracks trains 'cowboy'/'brawler'/'dynamiter'; Horsery trains
 * 'cowboyOnHorse' - the only building each kind can ever come from.
 */
export type UnitKind = 'cowboy' | 'cowboyOnHorse' | 'brawler' | 'dynamiter';

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  cowboy: 'Cowboy',
  cowboyOnHorse: 'Cowboy on Horse',
  brawler: 'Brawler',
  dynamiter: 'Dynamiter',
};

/** Phase 58: Brawler/Dynamiter training costs money (like Cowboy/Cowboy-on-Horse) AND a Phase 37 material, deducted together the instant the job is enqueued - see gameState's trainBrawler/trainDynamiter. */
export const BRAWLER_TRAIN_MATERIALS: Partial<Record<ResourceKey, number>> = { tools: 2 };
export const DYNAMITER_TRAIN_MATERIALS: Partial<Record<ResourceKey, number>> = { tools: 3 };

/**
 * Phase 53: Rally Points & Training Queue. A queued Barracks/Horsery training
 * job - money (and, since Phase 58, any per-kind `materials`) is deducted the
 * instant trainCowboy/trainMountedCowboy/trainBrawler/trainDynamiter enqueues
 * it, and `remainingTicks` (seeded from COWBOY_TRAIN_TICKS/
 * MOUNTED_COWBOY_TRAIN_TICKS/BRAWLER_TRAIN_TICKS/DYNAMITER_TRAIN_TICKS) only
 * counts down for the job at the front of `PlacedBuilding.trainingQueue`
 * (gameState's runTrainingQueues) - a classic one-at-a-time training queue,
 * not N jobs finishing in parallel. `kind` mirrors CombatUnit's discriminant
 * in MainScene.ts; a single building's queue is homogeneous per building type
 * (Barracks only ever enqueues 'cowboy'/'brawler'/'dynamiter', Horsery only
 * ever 'cowboyOnHorse'), but a single Barracks CAN now mix all three of its
 * kinds in one queue.
 */
export interface TrainingQueueJob {
  kind: UnitKind;
  remainingTicks: number;
}

export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  tileX: number;
  tileY: number;
  active: boolean;
  connected: boolean;
  assignedWorkers: number;
  staffed: boolean;
  /** Starts at maxHp on placement; regenerates each tick, 0 = disabled (Phase 21). */
  hp: number;
  /** Only meaningful for buildings with an AnimalConfig; owned livestock count, starts at 0. */
  animalCount: number;
  /** Only meaningful for Supermarket; last tick's autonomous sale, if any. */
  lastSale?: SupermarketSale;
  /**
   * Only meaningful for Saloon; last tick's autonomous liquor sale, if any.
   * Kept as its own field/pass (runSaloonSales) rather than folded into
   * lastSale/runSupermarketSales - the two buildings sell different resource
   * sets and a future change to one rate table shouldn't risk the other.
   */
  saloonSale?: SaloonSale;
  /** Only meaningful for Barracks; trained cowboy count, starts at 0, mirrors animalCount. */
  cowboyCount: number;
  /**
   * Only meaningful for Barracks: one HP value per trained cowboy, index-
   * aligned with that cowboy's garrisoned sprite slot (see
   * MainScene.getCowboySlotPosition). A parallel array (rather than e.g. a
   * Map<id, hp>) keeps "damage cowboy N" / "remove cowboy N at 0 HP" a plain
   * index read + splice, and index-alignment with the sprite slot layout is
   * exactly what Phase 23 needs to know which sprite to remove.
   */
  cowboyHp: number[];
  /**
   * Only meaningful for Horsery; trained Cowboy-on-Horse count, starts at 0.
   * A parallel pair to cowboyCount/cowboyHp above rather than reusing them -
   * Barracks and Horsery are two different buildings that can coexist, so
   * their trained-unit counts/HP must not collide in the same array.
   */
  mountedCowboyCount: number;
  /** Only meaningful for Horsery: one HP value per trained Cowboy-on-Horse, index-aligned with its spawn slot - same pattern as cowboyHp above. */
  mountedCowboyHp: number[];
  /**
   * Phase 58: only meaningful for Barracks; trained Brawler count/HP, a third
   * parallel pair alongside cowboyCount/cowboyHp above rather than a shared
   * collection - a Barracks trains three kinds now, and keeping each kind its
   * own count+array pair is a small, low-risk extension of the existing
   * pattern rather than a Record<UnitKind, {count,hp[]}> refactor of every
   * existing cowboyCount/mountedCowboyCount call site.
   */
  brawlerCount: number;
  brawlerHp: number[];
  /** Phase 58: only meaningful for Barracks; trained Dynamiter count/HP - same parallel-pair shape as brawlerCount/brawlerHp above. */
  dynamiterCount: number;
  dynamiterHp: number[];
  /** Only meaningful for Bank; starts at 0, grows via compounding interest each production tick (runBankInterest) and moves with deposit/withdraw. */
  bankBalance: number;
  /**
   * Phase 32: set when the town couldn't pay this building's upkeep on the
   * last tick. Distinct from destruction (Phase 31 removes a building at 0 HP
   * outright) and from understaffing: it's a recoverable, recomputed-every-
   * tick money problem, so it must not delete anything.
   */
  disabled: boolean;
  /** Phase 32: what a harvesting building actually pulled from vegetation last tick, for the info panel. */
  lastHarvest?: number;
  /** Phase 42: defaults to 'normal' on placement; player-set via setBuildingPriority, consumed by assignWorkforce's sort. */
  priority: WorkerPriority;
  /** Phase 46: only meaningful for House; current tier, starts at 1 on placement. Drives population contribution, tax, and sprite frame. */
  houseTier: HouseTier;
  /** Phase 46: only meaningful for House; consecutive ticks the current tier's needs have been fully met/unmet, reset on any tier change - the hysteresis pair runHouseNeeds uses to gate up/downgrades. */
  houseNeedsMetStreak: number;
  houseNeedsUnmetStreak: number;
  /** Phase 46: only meaningful for House; last tick's per-need-group met/missing snapshot, for the info panel. Empty until the first production tick after placement. */
  houseNeedsStatus: { label: string; met: boolean }[];
  /**
   * Phase 51: only meaningful for Trading Post; player-configured manual sell
   * orders keyed by resource, empty until the info panel's per-resource rows
   * are used. A plain object on every building (like cowboyHp/animalCount)
   * rather than a Map, so it survives the existing PlacedBuilding shape and
   * needs no special-cased serialization anywhere.
   */
  tradeOrders: Partial<Record<MarketableResourceKey, TradeOrderConfig>>;
  /** Only meaningful for Trading Post; last tick's autonomous sale from tradeOrders, mirroring lastSale/saloonSale. */
  tradingPostSale?: TradingPostSale;
  /**
   * Phase 53: only meaningful for Barracks/Horsery; pending training jobs,
   * front-of-queue-only countdown (see TrainingQueueJob's doc comment).
   * Always present (empty array, not undefined) on every PlacedBuilding, like
   * cowboyHp/animalCount, so nothing needs an existence check before reading
   * `.length`.
   */
  trainingQueue: TrainingQueueJob[];
  /**
   * Phase 53: only meaningful for Barracks/Horsery; a world point a freshly
   * trained unit immediately walks to instead of standing at its spawn slot.
   * Undefined (not a sentinel like {x:0,y:0}) when never set, matching
   * lastSale/lastHarvest's "absent means not yet meaningful" convention.
   */
  rallyPoint?: { x: number; y: number };
}

/**
 * Phase 58: the single place that knows which PlacedBuilding field pair a
 * given UnitKind reads/writes - every kind-branching call site in
 * gameState.ts (damageUnit, trainX, runTrainingQueues) and MainScene.ts
 * (isCowboyUnitAlive, getUnitHp) goes through these three functions instead
 * of re-deriving its own `kind === 'cowboy' ? building.cowboyHp : ...`
 * ternary/switch, so a future fifth kind only has to extend the switch here.
 */
export function getUnitHpArray(building: PlacedBuilding, kind: UnitKind): number[] {
  switch (kind) {
    case 'cowboy':
      return building.cowboyHp;
    case 'cowboyOnHorse':
      return building.mountedCowboyHp;
    case 'brawler':
      return building.brawlerHp;
    case 'dynamiter':
      return building.dynamiterHp;
  }
}

export function getUnitCount(building: PlacedBuilding, kind: UnitKind): number {
  switch (kind) {
    case 'cowboy':
      return building.cowboyCount;
    case 'cowboyOnHorse':
      return building.mountedCowboyCount;
    case 'brawler':
      return building.brawlerCount;
    case 'dynamiter':
      return building.dynamiterCount;
  }
}

export function setUnitCount(building: PlacedBuilding, kind: UnitKind, value: number): void {
  switch (kind) {
    case 'cowboy':
      building.cowboyCount = value;
      break;
    case 'cowboyOnHorse':
      building.mountedCowboyCount = value;
      break;
    case 'brawler':
      building.brawlerCount = value;
      break;
    case 'dynamiter':
      building.dynamiterCount = value;
      break;
  }
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  [BuildingType.CattleFarm]: {
    type: BuildingType.CattleFarm,
    label: 'Cattle Farm',
    cost: 100,
    size: { width: 2, height: 2 },
    color: 0xa1887f,
    category: BuildingCategory.Livestock,
    upkeep: 1,
    production: {},
    animal: {
      animalLabel: 'Cow',
      costPerAnimal: 20,
      maxAnimals: 5,
      outputPerAnimal: { rawMeat: 0.2, leather: 0.05 },
    },
    maxHp: 80,
  },
  [BuildingType.Butcher]: {
    type: BuildingType.Butcher,
    label: 'Butcher',
    cost: 150,
    materials: { wood: 5 },
    size: { width: 2, height: 2 },
    color: 0xc62828,
    category: BuildingCategory.Industry,
    upkeep: 1.5,
    production: { inputs: { rawMeat: 1, water: 1 }, outputs: { meat: 1 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 4 },
  },
  [BuildingType.Well]: {
    type: BuildingType.Well,
    label: 'Well',
    cost: 50,
    size: { width: 1, height: 1 },
    color: 0x0288d1,
    category: BuildingCategory.Infrastructure,
    upkeep: 0.5,
    production: { outputs: { water: 1 } },
    maxHp: 45,
  },
  [BuildingType.House]: {
    type: BuildingType.House,
    label: 'House',
    cost: 80,
    size: { width: 1, height: 1 },
    color: 0xffa726,
    category: BuildingCategory.Infrastructure,
    upkeep: 0.5,
    maxHp: 50,
  },
  [BuildingType.Road]: {
    type: BuildingType.Road,
    label: 'Road',
    cost: 10,
    size: { width: 1, height: 1 },
    color: 0x757575,
    category: BuildingCategory.Infrastructure,
    upkeep: 0,
    maxHp: 15,
  },
  [BuildingType.ChickenFarm]: {
    type: BuildingType.ChickenFarm,
    label: 'Chicken Farm',
    cost: 70,
    size: { width: 1, height: 1 },
    color: 0xfff8e1,
    category: BuildingCategory.Livestock,
    upkeep: 0.5,
    production: {},
    animal: { animalLabel: 'Chicken', costPerAnimal: 5, maxAnimals: 4, outputPerAnimal: { eggs: 0.2 } },
    maxHp: 45,
  },
  [BuildingType.PigFarm]: {
    type: BuildingType.PigFarm,
    label: 'Pig Farm',
    cost: 120,
    size: { width: 2, height: 2 },
    color: 0xe8a5b8,
    category: BuildingCategory.Livestock,
    upkeep: 1,
    production: {},
    animal: { animalLabel: 'Pig', costPerAnimal: 12, maxAnimals: 6, outputPerAnimal: { rawMeat: 0.25 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 5 },
  },
  [BuildingType.CowRanch]: {
    type: BuildingType.CowRanch,
    label: 'Cow Ranch',
    cost: 220,
    size: { width: 2, height: 2 },
    color: 0xbca88a,
    category: BuildingCategory.Livestock,
    upkeep: 1.5,
    production: {},
    animal: {
      animalLabel: 'Cow',
      costPerAnimal: 20,
      maxAnimals: 5,
      outputPerAnimal: { rawMeat: 0.5, leather: 0.1 },
    },
    maxHp: 100,
    unlockRequirement: { populationAtLeast: 6 },
  },
  [BuildingType.Fence]: {
    type: BuildingType.Fence,
    label: 'Fence',
    cost: 15,
    materials: { logs: 2 },
    size: { width: 1, height: 1 },
    color: 0xc9a063,
    category: BuildingCategory.Infrastructure,
    upkeep: 0,
    maxHp: 20,
  },
  [BuildingType.Warehouse]: {
    type: BuildingType.Warehouse,
    label: 'Warehouse',
    cost: 150,
    // Phase 50: Tools added alongside the existing Wood cost (not replacing
    // it) - see the Blacksmith chain doc comment further down this file.
    materials: { wood: 8, tools: 2 },
    size: { width: 2, height: 2 },
    color: 0x6d4c41,
    category: BuildingCategory.Infrastructure,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 100,
    unlockRequirement: { netWorthAtLeast: 2200 },
  },
  [BuildingType.Supermarket]: {
    type: BuildingType.Supermarket,
    label: 'Supermarket',
    cost: 200,
    materials: { wood: 6 },
    size: { width: 2, height: 2 },
    color: 0x8e24aa,
    category: BuildingCategory.Commerce,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 90,
    unlockRequirement: { netWorthAtLeast: 2500 },
  },
  [BuildingType.Barracks]: {
    type: BuildingType.Barracks,
    label: 'Barracks',
    cost: 180,
    materials: { wood: 10 },
    size: { width: 2, height: 2 },
    color: 0x37474f,
    category: BuildingCategory.Military,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 100,
    unlockRequirement: { dayAtLeast: 2 },
  },
  [BuildingType.Sewery]: {
    type: BuildingType.Sewery,
    label: 'Sewery',
    cost: 130,
    materials: { wood: 5 },
    size: { width: 2, height: 2 },
    color: 0x8d6e4a,
    category: BuildingCategory.Industry,
    upkeep: 1.5,
    production: { inputs: { leather: 1 }, outputs: { clothes: 1 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 8 },
  },
  [BuildingType.Forestry]: {
    type: BuildingType.Forestry,
    label: 'Forestry',
    cost: 60,
    size: { width: 2, height: 2 },
    color: 0x2e7d32,
    category: BuildingCategory.Farming,
    upkeep: 1,
    // Phase 32: no longer a flat `production.outputs` faucet - logs now come
    // out of actual Tree entities standing within radiusTiles, and the
    // Forestry slowly replants what it fells so a well-placed one is
    // sustainable while an over-dense cluster strips its radius bare.
    harvest: {
      kind: 'Tree',
      radiusTiles: 5,
      yieldPerTick: 1,
      outputs: { logs: 1.2 },
      replantChancePerTick: 0.12,
    },
    maxHp: 45,
    unlockRequirement: { populationAtLeast: 6 },
  },
  [BuildingType.WoodCutter]: {
    type: BuildingType.WoodCutter,
    label: 'Wood-cutter',
    cost: 100,
    // Deliberately Logs, not Wood: this is the only building that produces
    // Wood at all (from Logs), so costing it Wood would be an unbreakable
    // chicken-and-egg lock. Logs come straight from Forestry (money-only),
    // so the sawmill still has a real, satisfiable material cost.
    materials: { logs: 5 },
    size: { width: 2, height: 2 },
    color: 0x6d4c41,
    category: BuildingCategory.Industry,
    upkeep: 1.5,
    production: { inputs: { logs: 1 }, outputs: { wood: 1 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 8 },
  },
  [BuildingType.PotatoField]: {
    type: BuildingType.PotatoField,
    label: 'Potato Field',
    cost: 90,
    size: { width: 2, height: 2 },
    color: 0xc9a063,
    category: BuildingCategory.Farming,
    upkeep: 1,
    production: { outputs: { potatoes: 1.2 } },
    maxHp: 45,
    unlockRequirement: { populationAtLeast: 4 },
  },
  [BuildingType.Liquor]: {
    type: BuildingType.Liquor,
    label: 'Liquor Still',
    cost: 140,
    materials: { wood: 5 },
    size: { width: 2, height: 2 },
    color: 0xb87333,
    category: BuildingCategory.Industry,
    upkeep: 1.5,
    production: { inputs: { potatoes: 2 }, outputs: { liquor: 1 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 10 },
  },
  [BuildingType.Saloon]: {
    type: BuildingType.Saloon,
    label: 'Saloon',
    cost: 200,
    materials: { wood: 10, tools: 3 },
    size: { width: 2, height: 2 },
    color: 0xefebe9,
    category: BuildingCategory.Commerce,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 90,
    unlockRequirement: { netWorthAtLeast: 3200 },
  },
  [BuildingType.Horsery]: {
    type: BuildingType.Horsery,
    label: 'Horsery',
    cost: 220,
    materials: { wood: 10, tools: 4 },
    size: { width: 2, height: 2 },
    color: 0x795548,
    category: BuildingCategory.Military,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 100,
    unlockRequirement: { dayAtLeast: 3 },
  },
  [BuildingType.Bank]: {
    type: BuildingType.Bank,
    label: 'Bank',
    cost: 200,
    materials: { wood: 8, tools: 3 },
    size: { width: 2, height: 2 },
    color: 0x9e9e9e,
    category: BuildingCategory.Commerce,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 100,
    unlockRequirement: { netWorthAtLeast: 4000 },
  },
  [BuildingType.CactusMilker]: {
    type: BuildingType.CactusMilker,
    label: 'Cactus Milker',
    cost: 150,
    materials: { wood: 5 },
    size: { width: 2, height: 2 },
    color: 0x7cb342,
    category: BuildingCategory.Farming,
    upkeep: 1,
    // Phase 34: the "no replant, finite desert bounty" rule was a nice idea
    // that made the building unusable in practice - with the map's cactus
    // count it stripped its radius in under a minute and then sat dead for
    // the rest of the run. It now replants like Forestry, slightly slower
    // (cacti grow slower than pines), which together with the raised cactus
    // density/yield makes a well-sited Milker sustainable.
    harvest: {
      kind: 'Cactus',
      radiusTiles: 5,
      yieldPerTick: 1,
      outputs: { agaveJuice: 1 },
      replantChancePerTick: 0.1,
    },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 12 },
  },
  [BuildingType.Watchtower]: {
    type: BuildingType.Watchtower,
    label: 'Watchtower',
    cost: 130,
    materials: { wood: 6, tools: 2 },
    size: { width: 1, height: 1 },
    color: 0x5d4037,
    category: BuildingCategory.Military,
    upkeep: 1,
    requiresWorkers: true,
    maxHp: 60,
    unlockRequirement: { dayAtLeast: 2, populationAtLeast: 10 },
  },
  /**
   * Phase 50: Stone/Iron -> Blacksmith Tools Chain, the sixth production
   * chain following the exact Forestry->WoodCutter / PotatoField->Liquor
   * Still shape - two flat raw producers (Quarry/Iron Mine, gated to Gravel
   * terrain via getGravelDistance in gameState.ts, the same hard-placement-
   * gate pattern Phase 30's Well uses for water) feeding one processor
   * (Blacksmith). Tools then close the loop as both a new sellable good
   * (SUPERMARKET_SELL_RATES) and a new build material required by five
   * existing Wave-2/3 buildings below (Warehouse/Bank/Saloon/Horsery/
   * Watchtower), added alongside their existing Wood cost, not replacing it.
   */
  [BuildingType.Quarry]: {
    type: BuildingType.Quarry,
    label: 'Quarry',
    cost: 110,
    // Raw extraction, like Forestry/PotatoField - material-free so the chain
    // it starts isn't itself gated on a chain that doesn't exist yet.
    size: { width: 2, height: 2 },
    color: 0x8a8172,
    category: BuildingCategory.Farming,
    upkeep: 1,
    production: { outputs: { stone: 1.2 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 8 },
  },
  [BuildingType.IronMine]: {
    type: BuildingType.IronMine,
    label: 'Iron Mine',
    cost: 160,
    size: { width: 2, height: 2 },
    color: 0x8d6e63,
    category: BuildingCategory.Farming,
    upkeep: 1.2,
    // Iron is the rarer/slower half of the pair - half Quarry's stone rate.
    production: { outputs: { iron: 0.6 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 10 },
  },
  [BuildingType.Blacksmith]: {
    type: BuildingType.Blacksmith,
    label: 'Blacksmith',
    cost: 180,
    // The processor of the pair, like Sewery/WoodCutter/Liquor Still -
    // material-costed in Wood rather than the Stone/Iron it consumes as
    // production inputs.
    materials: { wood: 6 },
    size: { width: 2, height: 2 },
    color: 0x455a64,
    category: BuildingCategory.Industry,
    upkeep: 1.5,
    production: { inputs: { stone: 2, iron: 1 }, outputs: { tools: 1 } },
    maxHp: 80,
    unlockRequirement: { populationAtLeast: 12 },
  },
  /**
   * Phase 51: Trading Post & Fluctuating Prices. A staffed, no-production
   * commerce building like Supermarket/Saloon/Bank, but instead of a fixed
   * per-type rate table it exposes per-resource manual sell orders
   * (PlacedBuilding.tradeOrders) that the player configures in the info
   * panel; both automatic (Supermarket/Saloon) and manual (Trading Post)
   * sales now draw from the same fluctuating market (state/market.ts).
   * Gated as the latest Commerce building (above Bank's netWorthAtLeast
   * 4000) since manual price-timing only matters once a town has an economy
   * worth optimizing.
   */
  [BuildingType.TradingPost]: {
    type: BuildingType.TradingPost,
    label: 'Trading Post',
    cost: 260,
    materials: { wood: 10, tools: 4 },
    size: { width: 2, height: 2 },
    color: 0xc9a063,
    category: BuildingCategory.Commerce,
    upkeep: 2,
    requiresWorkers: true,
    maxHp: 100,
    unlockRequirement: { netWorthAtLeast: 5000, dayAtLeast: 3 },
  },
  /**
   * Phase 54: Irrigation & Crop Water Needs. A small staffed relay - no
   * `production` output field of its own - that extends usable irrigation
   * range out to water-dependent crops (PotatoField) that would otherwise be
   * too far from real water to yield much. Placement is hard-gated on being
   * within WELL_MAX_WATER_DISTANCE_TILES of open water exactly like a Well
   * (getPlacementRejection in gameState.ts); its ongoing effect on nearby
   * PotatoFields is computed in getCropWaterDistance, also gameState.ts.
   * Deliberately material-free and cheap like Well/Fence - it's an
   * infrastructure add-on, not a new production chain.
   */
  [BuildingType.WaterTower]: {
    type: BuildingType.WaterTower,
    label: 'Water Tower',
    cost: 90,
    size: { width: 1, height: 1 },
    color: 0x455a64,
    category: BuildingCategory.Infrastructure,
    upkeep: 0.8,
    requiresWorkers: true,
    maxHp: 55,
    unlockRequirement: { populationAtLeast: 6 },
  },
};

/**
 * Phase 43: 1x1 buildings that make sense to drag out as a line rather than
 * placed one tile at a time. Deliberately NOT every 1x1 building - House,
 * Well and Watchtower are each a meaningfully singular placement (one Well
 * per water source, one Watchtower covering a chokepoint), so a line-drag of
 * ten of them would almost never be what the player wants. Road and Fence
 * are the two that are actually laid out as runs in practice.
 */
export const LINE_PLACEMENT_BUILDING_TYPES: ReadonlySet<BuildingType> = new Set([
  BuildingType.Road,
  BuildingType.Fence,
]);

export function isLinePlacementBuilding(type: BuildingType): boolean {
  return LINE_PLACEMENT_BUILDING_TYPES.has(type);
}

/**
 * Buildings with a production chain, or explicitly flagged via
 * `requiresWorkers` (e.g. Warehouse, which has no production of its own but
 * still needs staff to operate), need workers. Demand scales with footprint
 * (tile count / 2, rounded up: 1 for 1x1, 2 for 2x2) rather than a
 * hand-picked number per type, so new building types stay staffed correctly
 * without touching this function.
 */
export function getWorkersRequired(type: BuildingType): number {
  const definition = BUILDING_DEFINITIONS[type];
  // Phase 32: harvesters (Forestry, Cactus Milker) count as production for
  // staffing purposes even though their output comes from a `harvest` rule
  // rather than a `production` block.
  if (!definition.production && !definition.harvest && !definition.requiresWorkers) {
    return 0;
  }
  return Math.ceil((definition.size.width * definition.size.height) / 2);
}

/**
 * Per-tick sell allotment for a staffed+active Supermarket. Not part of
 * BuildingProduction because selling reads/writes the resource pool and
 * Money directly rather than following the input->output production shape.
 */
export type SupermarketSellableKey = 'meat' | 'eggs' | 'potatoes' | 'wood' | 'clothes' | 'tools';

export const SUPERMARKET_SELL_RATES: Record<SupermarketSellableKey, { amount: number; price: number }> = {
  meat: { amount: 2, price: 5 },
  eggs: { amount: 2, price: 3 },
  potatoes: { amount: 2, price: 2 },
  wood: { amount: 2, price: 3 },
  clothes: { amount: 2, price: 15 },
  // Phase 50: Tools is the chain's tier-3 manufactured good and also a build
  // material (see BUILDING_DEFINITIONS' Phase 50 doc comment) - priced above
  // every other sellable, widening SupermarketSellableKey rather than
  // hardcoding a second table, per the "widen the union, don't hardcode"
  // approach Phase 26 established for this exact table.
  tools: { amount: 2, price: 20 },
};

/**
 * Same idea as SUPERMARKET_SELL_RATES. Phase 32 adds Agave Juice alongside
 * Liquor: the Cactus Milker's output is a drink, so the Saloon (not the
 * Supermarket) is where it belongs, and reusing the existing runSaloonSales
 * pass means the new chain needs no new selling logic at all.
 */
export type SaloonSellableKey = 'liquor' | 'agaveJuice';

export const SALOON_SELL_RATES: Record<SaloonSellableKey, { amount: number; price: number }> = {
  liquor: { amount: 2, price: 12 },
  agaveJuice: { amount: 2, price: 6 },
};

/**
 * Phase 51: every resource either sell table names, deduped (the two never
 * overlap today, but a Set guards against that changing later). This is the
 * full set of goods a Trading Post can carry an order for, and what
 * state/market.ts tracks a fluctuating price for.
 */
export const MARKETABLE_RESOURCE_KEYS: MarketableResourceKey[] = Array.from(
  new Set<MarketableResourceKey>([
    ...(Object.keys(SUPERMARKET_SELL_RATES) as SupermarketSellableKey[]),
    ...(Object.keys(SALOON_SELL_RATES) as SaloonSellableKey[]),
  ]),
);

/**
 * The fixed `price` each rate table used to sell at forever is now just the
 * peg a resource's fluctuating market price drifts around and is clamped
 * against (see MARKET_PRICE_FLOOR_FRACTION/CEIL_FRACTION in constants.ts).
 */
export const BASE_MARKET_PRICES: Record<MarketableResourceKey, number> = MARKETABLE_RESOURCE_KEYS.reduce(
  (acc, key) => {
    const supermarketRate = (SUPERMARKET_SELL_RATES as Partial<Record<MarketableResourceKey, { price: number }>>)[
      key
    ];
    const saloonRate = (SALOON_SELL_RATES as Partial<Record<MarketableResourceKey, { price: number }>>)[key];
    acc[key] = supermarketRate?.price ?? saloonRate?.price ?? 0;
    return acc;
  },
  {} as Record<MarketableResourceKey, number>,
);

export const BUILDING_ATLAS_KEY = 'buildings-atlas';

/**
 * Phase 46: House is the only building type with more than one sprite frame -
 * `tier` is accepted for every type (so callers can just pass a
 * PlacedBuilding's `houseTier` unconditionally) but only changes the key for
 * House at Tier 2/3; everything else always resolves to its single base
 * frame, exactly as before.
 */
export function buildingTextureKey(type: BuildingType, tier?: HouseTier): string {
  if (type === BuildingType.House && tier && tier > 1) {
    return `building-${type}-tier${tier}`;
  }
  return `building-${type}`;
}

/** Separate atlas from BUILDING_ATLAS_KEY: animals are a different asset class (small, per-instance, not per-tile). */
export const ANIMALS_ATLAS_KEY = 'animals-atlas';

/** On-screen size (px) of a single static animal sprite; smaller than TILE_SIZE so several fit around a footprint. */
export const ANIMAL_SPRITE_SIZE = 12;

export function animalTextureKey(animalLabel: AnimalKind): string {
  return `animal-${animalLabel}`;
}

/** Small idle-animation accents (Phase 19), layered above a building's own image; a different asset class again, so its own atlas. */
export const ACCENTS_ATLAS_KEY = 'accents-atlas';

/**
 * Phase 34 adds the two night-only accents (a lit House window, a campfire by
 * the Barracks) to Phase 19's idle-animation set rather than inventing a
 * second accent system: they are the same thing - a small sprite layered over
 * a building and tweened - and reusing ACCENTS_ATLAS_KEY means they cost no
 * new atlas, no new depth band and no new cleanup path.
 */
export type AccentKind =
  | 'WellCrank'
  | 'WarehouseDoor'
  | 'SupermarketAwning'
  | 'ChickenDoor'
  | 'HouseWindowLight'
  | 'Campfire';

export function accentTextureKey(kind: AccentKind): string {
  return `accent-${kind}`;
}

/** Distinct asset class again (Phase 20): decorative population sprites, unrelated to any single building footprint. */
export const VILLAGERS_ATLAS_KEY = 'villagers-atlas';

/** Same size class as animal sprites (Phase 18) so both read consistently at the same camera zoom. */
export const VILLAGER_SPRITE_SIZE = ANIMAL_SPRITE_SIZE;

/** Only one villager look exists, so a single fixed frame key (no per-kind lookup like animals/accents need). */
export const VILLAGER_TEXTURE_KEY = 'villager';

/** Distinct asset class again (Phase 22): garrisoned Cowboy units, only ever owned by a Barracks. */
export const COWBOYS_ATLAS_KEY = 'cowboys-atlas';

/** Same size class as animal/villager sprites so all garrisoned/static props read consistently. */
export const COWBOY_SPRITE_SIZE = ANIMAL_SPRITE_SIZE;

/** Only one cowboy look exists, so a single fixed frame key (no per-kind lookup like animals/accents need). */
export const COWBOY_TEXTURE_KEY = 'cowboy';

/**
 * Phase 28: Cowboy-on-Horse gets its own atlas rather than sharing
 * COWBOYS_ATLAS_KEY - its frame isn't the square ANIMAL_SPRITE_SIZE the rest
 * of the small-unit sprites share, so it needs its own width/height pair
 * registered as a distinct texture size.
 */
export const MOUNTED_COWBOYS_ATLAS_KEY = 'mounted-cowboys-atlas';

/** Wider than a plain Cowboy's square ANIMAL_SPRITE_SIZE frame to read as horse-body + rider. */
export const MOUNTED_COWBOY_SPRITE_WIDTH = 16;
export const MOUNTED_COWBOY_SPRITE_HEIGHT = 12;

/** Only one Cowboy-on-Horse look exists, so a single fixed frame key, same as COWBOY_TEXTURE_KEY. */
export const MOUNTED_COWBOY_TEXTURE_KEY = 'cowboy-on-horse';

/**
 * Phase 58: Brawler and Dynamiter are both square, same small-unit size class
 * as the plain Cowboy (COWBOY_SPRITE_SIZE, itself ANIMAL_SPRITE_SIZE) - only
 * Cowboy-on-Horse needs the wider non-square frame above, since it's the only
 * kind drawn as horse+rider rather than a single figure. Each gets its own
 * atlas (one frame apiece), same convention as COWBOYS_ATLAS_KEY/
 * MOUNTED_COWBOYS_ATLAS_KEY.
 */
export const BRAWLERS_ATLAS_KEY = 'brawlers-atlas';
export const BRAWLER_SPRITE_SIZE = COWBOY_SPRITE_SIZE;
export const BRAWLER_TEXTURE_KEY = 'brawler';

export const DYNAMITERS_ATLAS_KEY = 'dynamiters-atlas';
export const DYNAMITER_SPRITE_SIZE = COWBOY_SPRITE_SIZE;
export const DYNAMITER_TEXTURE_KEY = 'dynamiter';

/**
 * Phase 60: Goods Carts on Roads - a purely cosmetic, short-lived travel
 * sprite MainScene spawns whenever a road-connected building produces output,
 * animating it toward the nearest connected depot. Its own atlas/asset class,
 * same convention as MOUNTED_COWBOYS_ATLAS_KEY: a non-square frame (wagon bed
 * + wheels reads wider than tall) rather than the uniform ANIMAL_SPRITE_SIZE
 * square every other small-unit atlas uses.
 */
export const CARTS_ATLAS_KEY = 'carts-atlas';
export const CART_SPRITE_WIDTH = 14;
export const CART_SPRITE_HEIGHT = 10;
export const CART_TEXTURE_KEY = 'goods-cart';

/**
 * Phase 23: threat factions for raid events. Fictional names by deliberate
 * design (Outlaws/Rustlers/Coyotes), not standing in for any real group.
 */
export enum RaiderFaction {
  Outlaws = 'Outlaws',
  Rustlers = 'Rustlers',
  Coyotes = 'Coyotes',
}

/**
 * 'any' picks the nearest building regardless of type (Outlaws); 'farm-preferred'
 * prefers the nearest building with an AnimalConfig (Rustlers/Coyotes - cattle
 * thieves/wildlife go for livestock first) and falls back to 'any' behavior
 * when no farm building exists.
 */
export type RaiderTargeting = 'any' | 'farm-preferred';

export interface RaiderDefinition {
  faction: RaiderFaction;
  label: string;
  maxHp: number;
  damage: number;
  speedPxPerSec: number;
  targeting: RaiderTargeting;
}

export const RAIDER_DEFINITIONS: Record<RaiderFaction, RaiderDefinition> = {
  [RaiderFaction.Outlaws]: {
    faction: RaiderFaction.Outlaws,
    label: 'Outlaws',
    maxHp: 30,
    damage: 6,
    speedPxPerSec: 50,
    targeting: 'any',
  },
  [RaiderFaction.Rustlers]: {
    faction: RaiderFaction.Rustlers,
    label: 'Rustlers',
    maxHp: 25,
    damage: 5,
    speedPxPerSec: 50,
    targeting: 'farm-preferred',
  },
  [RaiderFaction.Coyotes]: {
    faction: RaiderFaction.Coyotes,
    label: 'Coyotes',
    maxHp: 15,
    damage: 3,
    speedPxPerSec: 75,
    targeting: 'farm-preferred',
  },
};

/**
 * Phase 58: factions vs. player unit kinds. Default 1.0 (no relationship);
 * only entries that deviate from that are listed per faction below. Picked
 * asymmetry (all within the 0.75x-1.5x band the phase spec called for):
 *  - Outlaws (tanky, any-target generalists) shrug off plain Cowboy fire
 *    (0.85x) but a Brawler's fists count double against them (1.4x) - the
 *    "armored generalist is weak to raw melee power" read.
 *  - Rustlers (cattle thieves, prefer farm buildings) are the squishiest
 *    against a Dynamiter's splash (1.35x) - already the least tanky raider
 *    alongside Coyotes, and a lobbed charge into a herd-thinning raid reads
 *    right thematically too.
 *  - Coyotes (fast/fragile wildlife) take extra Dynamiter splash (1.3x) - a
 *    wide-area weapon compensates for how hard a fast, scattering target is
 *    to land a single well-aimed Cowboy/Brawler hit on - but are NOT given
 *    any explicit Brawler resistance bonus here: their real counter to a
 *    slow melee unit is the mobility already implicit in
 *    RAIDER_DEFINITIONS.speedPxPerSec (75px/s vs. Outlaws/Rustlers' 50px/s) -
 *    a Coyote that wants to avoid a Brawler can simply outrun it, which is a
 *    fact about movement, not a damage multiplier to fake here.
 * A camp's own `faction` field indexes this table identically to a raider's,
 * so a unit fighting a Raider Camp gets the exact same counter relationships.
 */
export const FACTION_UNIT_DAMAGE_MULTIPLIER: Record<RaiderFaction, Partial<Record<UnitKind, number>>> = {
  [RaiderFaction.Outlaws]: { cowboy: 0.85, brawler: 1.4 },
  [RaiderFaction.Rustlers]: { dynamiter: 1.35 },
  [RaiderFaction.Coyotes]: { dynamiter: 1.3 },
};

/** Looks up FACTION_UNIT_DAMAGE_MULTIPLIER, defaulting to 1.0 (no counter relationship) for any faction/kind pair not explicitly listed above. */
export function getFactionUnitDamageMultiplier(faction: RaiderFaction, kind: UnitKind): number {
  return FACTION_UNIT_DAMAGE_MULTIPLIER[faction][kind] ?? 1;
}

/**
 * Phase 33: one small icon per resource for the redesigned HUD panel. Its own
 * atlas again (a UI asset class, not a world one) and its own size constant -
 * these are read at a glance in a dense grid, not placed on the map.
 */
export const RESOURCE_ICONS_ATLAS_KEY = 'resource-icons-atlas';
export const RESOURCE_ICON_SIZE = 12;

export function resourceIconTextureKey(key: ResourceKey): string {
  return `resource-icon-${key}`;
}

/** Distinct asset class again (Phase 23): hostile raid units, unrelated to any single building footprint. */
export const RAIDERS_ATLAS_KEY = 'raiders-atlas';

/** Same size class as animal/villager/cowboy sprites so all small units read consistently at the same camera zoom. */
export const RAIDER_SPRITE_SIZE = ANIMAL_SPRITE_SIZE;

export function raiderTextureKey(faction: RaiderFaction): string {
  return `raider-${faction}`;
}

/**
 * Phase 57: Raider Camps. Own atlas, one frame per faction like
 * RAIDERS_ATLAS_KEY/RAIDER_SPRITE_SIZE above, but a larger frame - a camp is
 * a standing cluster of tents/a campfire, not a single moving creature, and
 * needs to read as a structure at a glance (including as a bigger dot on the
 * minimap).
 */
export const RAIDER_CAMPS_ATLAS_KEY = 'raider-camps-atlas';
export const RAIDER_CAMP_SPRITE_SIZE = 24;

export function raiderCampTextureKey(faction: RaiderFaction): string {
  return `raider-camp-${faction}`;
}

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
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
  agaveJuice: 'Agave Juice',
  stone: 'Stone',
  iron: 'Iron',
  tools: 'Tools',
};

/** Exported (Phase 37): also used to format a building's `materials` cost for tooltips/the building bar. */
export function formatResourceMap(map: Partial<Record<ResourceKey, number>>): string {
  return (Object.entries(map) as [ResourceKey, number][])
    .map(([key, amount]) => `${amount} ${RESOURCE_LABELS[key]}`)
    .join(', ');
}

/** Phase 37: "$80" for a money-only building, "$80 + 5 Wood" once `materials` is set - the single formatter every cost display (tooltip, building-bar cost tag, placement-rejection text) shares. */
export function formatBuildingCost(definition: BuildingDefinition): string {
  const { materials } = definition;
  if (!materials || Object.keys(materials).length === 0) {
    return `$${definition.cost}`;
  }
  return `$${definition.cost} + ${formatResourceMap(materials)}`;
}

export function describeBuilding(definition: BuildingDefinition): string {
  const parts = [
    `Cost: ${formatBuildingCost(definition)}`,
    `Size: ${definition.size.width}x${definition.size.height}`,
  ];
  if (definition.production?.inputs) {
    parts.push(`Consumes: ${formatResourceMap(definition.production.inputs)}`);
  }
  if (definition.production?.outputs) {
    parts.push(`Produces: ${formatResourceMap(definition.production.outputs)}`);
  }
  if (definition.upkeep > 0) {
    parts.push(`Upkeep: $${definition.upkeep}/tick`);
  }
  if (definition.harvest) {
    const { kind, radiusTiles, outputs } = definition.harvest;
    parts.push(`Harvests ${kind}s within ${radiusTiles} tiles -> ${formatResourceMap(outputs)}`);
  }
  if (definition.type === BuildingType.Well) {
    parts.push(`Must be within ${WELL_MAX_WATER_DISTANCE_TILES} tiles of water; output falls off with distance`);
  }
  if (definition.type === BuildingType.Quarry || definition.type === BuildingType.IronMine) {
    parts.push(`Must be on or within ${GRAVEL_MAX_DISTANCE_TILES} tiles of Gravel`);
  }
  if (definition.type === BuildingType.PotatoField) {
    parts.push(
      `Output falls off beyond ${WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES} tiles from water (or a Water Tower's irrigation)`,
    );
  }
  if (definition.type === BuildingType.WaterTower) {
    parts.push(
      `Must be within ${WELL_MAX_WATER_DISTANCE_TILES} tiles of water; irrigates Potato Fields within ${WATER_TOWER_IRRIGATION_RADIUS_TILES} tiles`,
    );
  }
  if (definition.animal) {
    const { animalLabel, costPerAnimal, maxAnimals, outputPerAnimal } = definition.animal;
    parts.push(`${animalLabel}s: $${costPerAnimal} each, up to ${maxAnimals}`);
    parts.push(`Produces per ${animalLabel}: ${formatResourceMap(outputPerAnimal)}`);
  }
  if (definition.type === BuildingType.Supermarket) {
    // Phase 51: "@$X" read as a fixed price, which stopped being true once
    // SUPERMARKET_SELL_RATES became the fluctuating market's baseline peg
    // rather than the actual sale price - "~$X" signals it moves.
    const sellText = (Object.entries(SUPERMARKET_SELL_RATES) as [ResourceKey, { amount: number; price: number }][])
      .map(([key, { amount, price }]) => `${amount} ${RESOURCE_LABELS[key]} ~$${price}`)
      .join(', ');
    parts.push(`Sells: ${sellText} per tick (market price fluctuates)`);
  }
  if (definition.type === BuildingType.Saloon) {
    const sellText = (Object.entries(SALOON_SELL_RATES) as [ResourceKey, { amount: number; price: number }][])
      .map(([key, { amount, price }]) => `${amount} ${RESOURCE_LABELS[key]} ~$${price}`)
      .join(', ');
    parts.push(`Sells: ${sellText} per tick (market price fluctuates)`);
  }
  if (definition.type === BuildingType.TradingPost) {
    parts.push(
      `Configure manual sell orders (enable, threshold, amount) per resource in the info panel - trades at the same fluctuating market price as Supermarket/Saloon`,
    );
    parts.push(`Tradeable: ${MARKETABLE_RESOURCE_KEYS.map((key) => RESOURCE_LABELS[key]).join(', ')}`);
  }
  if (definition.type === BuildingType.Barracks) {
    parts.push(`Cowboys: $${COWBOY_TRAIN_COST} each, up to ${COWBOY_MAX_PER_BARRACKS}`);
    parts.push(
      `Brawlers: $${BRAWLER_TRAIN_COST} + ${formatResourceMap(BRAWLER_TRAIN_MATERIALS)} each, up to ${BRAWLER_MAX_PER_BARRACKS}`,
    );
    parts.push(
      `Dynamiters: $${DYNAMITER_TRAIN_COST} + ${formatResourceMap(DYNAMITER_TRAIN_MATERIALS)} each, up to ${DYNAMITER_MAX_PER_BARRACKS}`,
    );
  }
  if (definition.type === BuildingType.Horsery) {
    parts.push(`Cowboys on Horse: $${MOUNTED_COWBOY_TRAIN_COST} each, up to ${MOUNTED_COWBOY_MAX_PER_HORSERY}`);
  }
  if (definition.type === BuildingType.Bank) {
    parts.push(`Interest: ${BANK_INTEREST_RATE * 100}% per tick (compounding)`);
  }
  if (definition.type === BuildingType.Watchtower) {
    parts.push(`Auto-fires ${WATCHTOWER_DAMAGE} dmg at the nearest raider within ${WATCHTOWER_RANGE_TILES} tiles`);
  }
  if (definition.type === BuildingType.House) {
    parts.push(
      `Grows Tier 1->3 as needs are met (pop ${HOUSE_TIER_CONFIG[1].population}/${HOUSE_TIER_CONFIG[2].population}/${HOUSE_TIER_CONFIG[3].population}, tax $0/$${HOUSE_TIER_CONFIG[2].taxPerTick}/$${HOUSE_TIER_CONFIG[3].taxPerTick} per tick)`,
    );
  }
  return parts.join(' | ');
}
