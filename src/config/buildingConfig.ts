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
}

export interface BuildingSize {
  width: number;
  height: number;
}

export type ResourceKey = 'rawMeat' | 'meat' | 'water' | 'eggs';

export interface BuildingProduction {
  inputs?: Partial<Record<ResourceKey, number>>;
  outputs?: Partial<Record<ResourceKey, number>>;
  /** Full output rate needs an adjacent Fence building; otherwise output is halved. */
  requiresFence?: boolean;
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
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  [BuildingType.CattleFarm]: {
    type: BuildingType.CattleFarm,
    label: 'Cattle Farm',
    cost: 100,
    size: { width: 2, height: 2 },
    color: 0xa1887f,
    production: { outputs: { rawMeat: 1 } },
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
    production: { outputs: { eggs: 0.8 } },
  },
  [BuildingType.PigFarm]: {
    type: BuildingType.PigFarm,
    label: 'Pig Farm',
    cost: 120,
    size: { width: 2, height: 2 },
    color: 0xe8a5b8,
    production: { outputs: { rawMeat: 1.5 } },
  },
  [BuildingType.CowRanch]: {
    type: BuildingType.CowRanch,
    label: 'Cow Ranch',
    cost: 220,
    size: { width: 2, height: 2 },
    color: 0xbca88a,
    production: { outputs: { rawMeat: 2.5 }, requiresFence: true },
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

export const BUILDING_ATLAS_KEY = 'buildings-atlas';

export function buildingTextureKey(type: BuildingType): string {
  return `building-${type}`;
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
  return parts.join(' | ');
}
