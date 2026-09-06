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
  /** Phase 34: player-facing plural. `${kind}s` produced "Cactuss" in the info panel and placement warnings. */
  pluralLabel: string;
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
    pluralLabel: 'Trees',
    density: 0.05,
    terrain: [TileType.Dirt, TileType.Gravel],
    maxYield: 12,
    color: 0x2e7d32,
  },
  /**
   * Phase 34 balance fix. At density 0.035 over sand-only terrain a generated
   * map carried 3-11 cacti in total, and a Cactus Milker (radius 5, 1 yield
   * per 2s tick, no replant) drank its entire radius dry in 16-64 seconds and
   * then produced nothing for the rest of the run - the building was
   * effectively unshippable. Density is raised ~3.5x, sand itself is now a
   * larger share of the map (mapConfig's weighted ground-patch pick), maxYield
   * is up from 8, and the Milker got a replant chance of its own (see
   * BUILDING_DEFINITIONS[CactusMilker].harvest) so a well-placed one is
   * sustainable rather than strictly single-use.
   */
  Cactus: {
    kind: 'Cactus',
    label: 'Cactus',
    pluralLabel: 'Cacti',
    density: 0.12,
    terrain: [TileType.Sand],
    maxYield: 14,
    color: 0x689f38,
  },
};

/** Own atlas, same reasoning as the animal/villager/raider atlases: a distinct asset class with its own frame size. */
export const VEGETATION_ATLAS_KEY = 'vegetation-atlas';

/** Drawn tile-sized (unlike the 12px small-unit sprites) since a tree/cactus occupies a full tile. */
export function vegetationTextureKey(kind: VegetationKind): string {
  return `vegetation-${kind}`;
}
