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
}

export interface BuildingSize {
  width: number;
  height: number;
}

export type ResourceKey = 'rawMeat' | 'meat' | 'water' | 'eggs';

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
}

export interface SupermarketSale {
  meat: number;
  eggs: number;
  revenue: number;
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
  /** Only meaningful for buildings with an AnimalConfig; owned livestock count, starts at 0. */
  animalCount: number;
  /** Only meaningful for Supermarket; last tick's autonomous sale, if any. */
  lastSale?: SupermarketSale;
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  [BuildingType.CattleFarm]: {
    type: BuildingType.CattleFarm,
    label: 'Cattle Farm',
    cost: 100,
    size: { width: 2, height: 2 },
    color: 0xa1887f,
    production: {},
    animal: { animalLabel: 'Cow', costPerAnimal: 20, maxAnimals: 5, outputPerAnimal: { rawMeat: 0.2 } },
  },
  [BuildingType.Butcher]: {
    type: BuildingType.Butcher,
    label: 'Butcher',
    cost: 150,
    size: { width: 2, height: 2 },
    color: 0xc62828,
    production: { inputs: { rawMeat: 1, water: 1 }, outputs: { meat: 1 } },
  },
  [BuildingType.Well]: {
    type: BuildingType.Well,
    label: 'Well',
    cost: 50,
    size: { width: 1, height: 1 },
    color: 0x0288d1,
    production: { outputs: { water: 1 } },
  },
  [BuildingType.House]: {
    type: BuildingType.House,
    label: 'House',
    cost: 80,
    size: { width: 1, height: 1 },
    color: 0xffa726,
  },
  [BuildingType.Road]: {
    type: BuildingType.Road,
    label: 'Road',
    cost: 10,
    size: { width: 1, height: 1 },
    color: 0x757575,
  },
  [BuildingType.ChickenFarm]: {
    type: BuildingType.ChickenFarm,
    label: 'Chicken Farm',
    cost: 70,
    size: { width: 1, height: 1 },
    color: 0xfff8e1,
    production: {},
    animal: { animalLabel: 'Chicken', costPerAnimal: 5, maxAnimals: 4, outputPerAnimal: { eggs: 0.2 } },
  },
  [BuildingType.PigFarm]: {
    type: BuildingType.PigFarm,
    label: 'Pig Farm',
    cost: 120,
    size: { width: 2, height: 2 },
    color: 0xe8a5b8,
    production: {},
    animal: { animalLabel: 'Pig', costPerAnimal: 12, maxAnimals: 6, outputPerAnimal: { rawMeat: 0.25 } },
  },
  [BuildingType.CowRanch]: {
    type: BuildingType.CowRanch,
    label: 'Cow Ranch',
    cost: 220,
    size: { width: 2, height: 2 },
    color: 0xbca88a,
    production: {},
    animal: { animalLabel: 'Cow', costPerAnimal: 20, maxAnimals: 5, outputPerAnimal: { rawMeat: 0.5 } },
  },
  [BuildingType.Fence]: {
    type: BuildingType.Fence,
    label: 'Fence',
    cost: 15,
    size: { width: 1, height: 1 },
    color: 0xc9a063,
  },
  [BuildingType.Warehouse]: {
    type: BuildingType.Warehouse,
    label: 'Warehouse',
    cost: 150,
    size: { width: 2, height: 2 },
    color: 0x6d4c41,
    requiresWorkers: true,
  },
  [BuildingType.Supermarket]: {
    type: BuildingType.Supermarket,
    label: 'Supermarket',
    cost: 200,
    size: { width: 2, height: 2 },
    color: 0x8e24aa,
    requiresWorkers: true,
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
export const SUPERMARKET_SELL_RATES: Record<'meat' | 'eggs', { amount: number; price: number }> = {
  meat: { amount: 2, price: 5 },
  eggs: { amount: 2, price: 3 },
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

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  rawMeat: 'Raw Meat',
  meat: 'Meat',
  water: 'Water',
  eggs: 'Eggs',
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
    const { meat, eggs } = SUPERMARKET_SELL_RATES;
    parts.push(
      `Sells: ${meat.amount} Meat @$${meat.price}, ${eggs.amount} Eggs @$${eggs.price} per tick`,
    );
  }
  return parts.join(' | ');
}
