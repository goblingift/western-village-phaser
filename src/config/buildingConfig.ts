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

export interface BuildingDefinition {
  type: BuildingType;
  label: string;
  cost: number;
  size: BuildingSize;
  color: number;
}

export interface PlacedBuilding {
  id: string;
  type: BuildingType;
  tileX: number;
  tileY: number;
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  [BuildingType.CattleFarm]: {
    type: BuildingType.CattleFarm,
    label: 'Cattle Farm',
    cost: 100,
    size: { width: 2, height: 2 },
    color: 0xa1887f,
  },
  [BuildingType.Butcher]: {
    type: BuildingType.Butcher,
    label: 'Butcher',
    cost: 150,
    size: { width: 2, height: 2 },
    color: 0xc62828,
  },
  [BuildingType.Well]: {
    type: BuildingType.Well,
    label: 'Well',
    cost: 50,
    size: { width: 1, height: 1 },
    color: 0x0288d1,
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

export function buildingTextureKey(type: BuildingType): string {
  return `building-${type}`;
}
