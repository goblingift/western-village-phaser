import {
  BANK_INTEREST_RATE,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_TRAIN_COST,
  MOUNTED_COWBOY_MAX_PER_HORSERY,
  MOUNTED_COWBOY_TRAIN_COST,
  WATCHTOWER_DAMAGE,
  WATCHTOWER_RANGE_TILES,
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
  | 'agaveJuice';

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
 * Phase 42: player-controlled staffing order. assignWorkforce (gameState.ts)
 * processes every High-priority building before any Normal, and every Normal
 * before any Low, so a scarce population pool gets funneled to whichever
 * buildings the player flags as most important instead of whatever happened
 * to get placed first.
 */
export type WorkerPriority = 'high' | 'normal' | 'low';

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
    materials: { wood: 8 },
    size: { width: 2, height: 2 },
    color: 0x6d4c41,
    category: BuildingCategory.Infrastructure,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 100,
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
  },
  [BuildingType.Saloon]: {
    type: BuildingType.Saloon,
    label: 'Saloon',
    cost: 200,
    materials: { wood: 10 },
    size: { width: 2, height: 2 },
    color: 0xefebe9,
    category: BuildingCategory.Commerce,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 90,
  },
  [BuildingType.Horsery]: {
    type: BuildingType.Horsery,
    label: 'Horsery',
    cost: 220,
    materials: { wood: 10 },
    size: { width: 2, height: 2 },
    color: 0x795548,
    category: BuildingCategory.Military,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 100,
  },
  [BuildingType.Bank]: {
    type: BuildingType.Bank,
    label: 'Bank',
    cost: 200,
    materials: { wood: 8 },
    size: { width: 2, height: 2 },
    color: 0x9e9e9e,
    category: BuildingCategory.Commerce,
    upkeep: 1.5,
    requiresWorkers: true,
    maxHp: 100,
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
  },
  [BuildingType.Watchtower]: {
    type: BuildingType.Watchtower,
    label: 'Watchtower',
    cost: 130,
    materials: { wood: 6 },
    size: { width: 1, height: 1 },
    color: 0x5d4037,
    category: BuildingCategory.Military,
    upkeep: 1,
    requiresWorkers: true,
    maxHp: 60,
  },
};

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
export type SupermarketSellableKey = 'meat' | 'eggs' | 'potatoes' | 'wood' | 'clothes';

export const SUPERMARKET_SELL_RATES: Record<SupermarketSellableKey, { amount: number; price: number }> = {
  meat: { amount: 2, price: 5 },
  eggs: { amount: 2, price: 3 },
  potatoes: { amount: 2, price: 2 },
  wood: { amount: 2, price: 3 },
  clothes: { amount: 2, price: 15 },
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

export const BUILDING_ATLAS_KEY = 'buildings-atlas';

export function buildingTextureKey(type: BuildingType): string {
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
  if (definition.animal) {
    const { animalLabel, costPerAnimal, maxAnimals, outputPerAnimal } = definition.animal;
    parts.push(`${animalLabel}s: $${costPerAnimal} each, up to ${maxAnimals}`);
    parts.push(`Produces per ${animalLabel}: ${formatResourceMap(outputPerAnimal)}`);
  }
  if (definition.type === BuildingType.Supermarket) {
    const sellText = (Object.entries(SUPERMARKET_SELL_RATES) as [ResourceKey, { amount: number; price: number }][])
      .map(([key, { amount, price }]) => `${amount} ${RESOURCE_LABELS[key]} @$${price}`)
      .join(', ');
    parts.push(`Sells: ${sellText} per tick`);
  }
  if (definition.type === BuildingType.Saloon) {
    const sellText = (Object.entries(SALOON_SELL_RATES) as [ResourceKey, { amount: number; price: number }][])
      .map(([key, { amount, price }]) => `${amount} ${RESOURCE_LABELS[key]} @$${price}`)
      .join(', ');
    parts.push(`Sells: ${sellText} per tick`);
  }
  if (definition.type === BuildingType.Barracks) {
    parts.push(`Cowboys: $${COWBOY_TRAIN_COST} each, up to ${COWBOY_MAX_PER_BARRACKS}`);
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
  return parts.join(' | ');
}
