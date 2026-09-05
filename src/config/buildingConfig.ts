export enum BuildingType {
  CattleFarm = 'CattleFarm',
  Butcher = 'Butcher',
  Well = 'Well',
  House = 'House',
  Road = 'Road',
}

export interface BuildingSize {
  width: number;
  height: number;
}

export type ResourceKey = 'rawMeat' | 'meat' | 'water';

export interface BuildingProduction {
  inputs?: Partial<Record<ResourceKey, number>>;
  outputs?: Partial<Record<ResourceKey, number>>;
}

export interface BuildingDefinition {
  type: BuildingType;
  label: string;
  cost: number;
  size: BuildingSize;
  color: number;
  production?: BuildingProduction;
}

export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  tileX: number;
  tileY: number;
  active: boolean;
  connected: boolean;
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
};

export const BUILDING_ATLAS_KEY = 'buildings-atlas';

export function buildingTextureKey(type: BuildingType): string {
  return `building-${type}`;
}

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  rawMeat: 'Raw Meat',
  meat: 'Meat',
  water: 'Water',
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
