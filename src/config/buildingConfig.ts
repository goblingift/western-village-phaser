import { COWBOY_MAX_PER_BARRACKS, COWBOY_TRAIN_COST } from './constants';

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
  | 'liquor';

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

export interface BuildingDefinition {
  type: BuildingType;
  label: string;
  cost: number;
  size: BuildingSize;
  color: number;
  production?: BuildingProduction;
  /** Marks a non-production building (e.g. Warehouse) as still needing staff to function. */
  requiresWorkers?: boolean;
  animal?: AnimalConfig;
  /** Starting/full hit points (Phase 21); tiered roughly by cost/footprint. */
  maxHp: number;
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
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  [BuildingType.CattleFarm]: {
    type: BuildingType.CattleFarm,
    label: 'Cattle Farm',
    cost: 100,
    size: { width: 2, height: 2 },
    color: 0xa1887f,
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
    size: { width: 2, height: 2 },
    color: 0xc62828,
    production: { inputs: { rawMeat: 1, water: 1 }, outputs: { meat: 1 } },
    maxHp: 80,
  },
  [BuildingType.Well]: {
    type: BuildingType.Well,
    label: 'Well',
    cost: 50,
    size: { width: 1, height: 1 },
    color: 0x0288d1,
    production: { outputs: { water: 1 } },
    maxHp: 45,
  },
  [BuildingType.House]: {
    type: BuildingType.House,
    label: 'House',
    cost: 80,
    size: { width: 1, height: 1 },
    color: 0xffa726,
    maxHp: 50,
  },
  [BuildingType.Road]: {
    type: BuildingType.Road,
    label: 'Road',
    cost: 10,
    size: { width: 1, height: 1 },
    color: 0x757575,
    maxHp: 15,
  },
  [BuildingType.ChickenFarm]: {
    type: BuildingType.ChickenFarm,
    label: 'Chicken Farm',
    cost: 70,
    size: { width: 1, height: 1 },
    color: 0xfff8e1,
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
    size: { width: 1, height: 1 },
    color: 0xc9a063,
    maxHp: 20,
  },
  [BuildingType.Warehouse]: {
    type: BuildingType.Warehouse,
    label: 'Warehouse',
    cost: 150,
    size: { width: 2, height: 2 },
    color: 0x6d4c41,
    requiresWorkers: true,
    maxHp: 100,
  },
  [BuildingType.Supermarket]: {
    type: BuildingType.Supermarket,
    label: 'Supermarket',
    cost: 200,
    size: { width: 2, height: 2 },
    color: 0x8e24aa,
    requiresWorkers: true,
    maxHp: 90,
  },
  [BuildingType.Barracks]: {
    type: BuildingType.Barracks,
    label: 'Barracks',
    cost: 180,
    size: { width: 2, height: 2 },
    color: 0x37474f,
    requiresWorkers: true,
    maxHp: 100,
  },
  [BuildingType.Sewery]: {
    type: BuildingType.Sewery,
    label: 'Sewery',
    cost: 130,
    size: { width: 2, height: 2 },
    color: 0x8d6e4a,
    production: { inputs: { leather: 1 }, outputs: { clothes: 1 } },
    maxHp: 80,
  },
  [BuildingType.Forestry]: {
    type: BuildingType.Forestry,
    label: 'Forestry',
    cost: 60,
    size: { width: 2, height: 2 },
    color: 0x2e7d32,
    production: { outputs: { logs: 1.2 } },
    maxHp: 45,
  },
  [BuildingType.WoodCutter]: {
    type: BuildingType.WoodCutter,
    label: 'Wood-cutter',
    cost: 100,
    size: { width: 2, height: 2 },
    color: 0x6d4c41,
    production: { inputs: { logs: 1 }, outputs: { wood: 1 } },
    maxHp: 80,
  },
  [BuildingType.PotatoField]: {
    type: BuildingType.PotatoField,
    label: 'Potato Field',
    cost: 90,
    size: { width: 2, height: 2 },
    color: 0xc9a063,
    production: { outputs: { potatoes: 1.2 } },
    maxHp: 45,
  },
  [BuildingType.Liquor]: {
    type: BuildingType.Liquor,
    label: 'Liquor Still',
    cost: 140,
    size: { width: 2, height: 2 },
    color: 0xb87333,
    production: { inputs: { potatoes: 2 }, outputs: { liquor: 1 } },
    maxHp: 80,
  },
  [BuildingType.Saloon]: {
    type: BuildingType.Saloon,
    label: 'Saloon',
    cost: 200,
    size: { width: 2, height: 2 },
    color: 0xefebe9,
    requiresWorkers: true,
    maxHp: 90,
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
  if (!definition.production && !definition.requiresWorkers) {
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

/** Same idea as SUPERMARKET_SELL_RATES, but Saloon only ever sells Liquor. */
export type SaloonSellableKey = 'liquor';

export const SALOON_SELL_RATES: Record<SaloonSellableKey, { amount: number; price: number }> = {
  liquor: { amount: 2, price: 12 },
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

export type AccentKind = 'WellCrank' | 'WarehouseDoor' | 'SupermarketAwning' | 'ChickenDoor';

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

/** Distinct asset class again (Phase 23): hostile raid units, unrelated to any single building footprint. */
export const RAIDERS_ATLAS_KEY = 'raiders-atlas';

/** Same size class as animal/villager/cowboy sprites so all small units read consistently at the same camera zoom. */
export const RAIDER_SPRITE_SIZE = ANIMAL_SPRITE_SIZE;

export function raiderTextureKey(faction: RaiderFaction): string {
  return `raider-${faction}`;
}

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

function formatResourceMap(map: Partial<Record<ResourceKey, number>>): string {
  return (Object.entries(map) as [ResourceKey, number][])
    .map(([key, amount]) => `${amount} ${RESOURCE_LABELS[key]}`)
    .join(', ');
}

export function describeBuilding(definition: BuildingDefinition): string {
  const parts = [
    `Cost: $${definition.cost}`,
    `Size: ${definition.size.width}x${definition.size.height}`,
  ];
  if (definition.production?.inputs) {
    parts.push(`Consumes: ${formatResourceMap(definition.production.inputs)}`);
  }
  if (definition.production?.outputs) {
    parts.push(`Produces: ${formatResourceMap(definition.production.outputs)}`);
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
  return parts.join(' | ');
}
