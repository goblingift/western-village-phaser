import { TileType } from './mapConfig';

/**
 * Phase 30: vegetation is a real world entity (state/vegetation.ts), not tile
 * art - it occupies a tile, blocks building placement, carries a depletable
 * yield and is harvested by nearby buildings. Its *config* lives here rather
 * than beside the entity store so buildingConfig.ts can reference a
 * VegetationKind in a building's harvest rule without importing game state.
 */
export type VegetationKind = 'Tree' | 'Cactus';

export interface VegetationDefinition {
  kind: VegetationKind;
  label: string;
  /** Share of eligible tiles seeded with this kind at world generation. */
  density: number;
  /** Terrain this kind grows on; anything else is never seeded/replanted. */
  terrain: readonly TileType[];
  /** Total harvestable units before the entity is used up and removed. */
  maxYield: number;
  /** Flat-color dot used for the minimap. */
  color: number;
}

export const VEGETATION_DEFINITIONS: Record<VegetationKind, VegetationDefinition> = {
  Tree: {
    kind: 'Tree',
    label: 'Tree',
    density: 0.05,
    terrain: [TileType.Dirt, TileType.Gravel],
    maxYield: 12,
    color: 0x2e7d32,
  },
  Cactus: {
    kind: 'Cactus',
    label: 'Cactus',
    density: 0.035,
    terrain: [TileType.Sand],
    maxYield: 8,
    color: 0x689f38,
  },
};

/** Own atlas, same reasoning as the animal/villager/raider atlases: a distinct asset class with its own frame size. */
export const VEGETATION_ATLAS_KEY = 'vegetation-atlas';

/** Drawn tile-sized (unlike the 12px small-unit sprites) since a tree/cactus occupies a full tile. */
export function vegetationTextureKey(kind: VegetationKind): string {
  return `vegetation-${kind}`;
}
