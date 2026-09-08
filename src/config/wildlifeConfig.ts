/**
 * Phase 71: Hostile Wildlife. A standalone, no-gameState-import config table,
 * matching vegetationConfig.ts's own convention (buildingConfig.ts/MainScene
 * can reference a WildlifeKind without pulling in game state). Wildlife is
 * genuinely distinct from the Raider/RaiderCamp system: it roams like a
 * decorative villager rather than committing to one building target, it only
 * ever targets living units/villagers (never buildings), and it is an
 * ambient world hazard from minute one - not gated to night-only or any raid
 * eligibility window.
 */
export type WildlifeKind = 'Snake' | 'Coyote' | 'MountainLion';

export interface WildlifeDefinition {
  kind: WildlifeKind;
  label: string;
  maxHp: number;
  damage: number;
  speedPxPerSec: number;
  /** How far (in tiles) this creature notices a nearby unit/villager and switches from roaming to hunting. */
  detectionRadiusTiles: number;
  attackRangeTiles: number;
  /** Relative weight in the spawn roll - higher is more common. Snake is cheap/weak/common, Mountain Lion is rare/dangerous. */
  spawnWeight: number;
}

export const WILDLIFE_DEFINITIONS: Record<WildlifeKind, WildlifeDefinition> = {
  Snake: {
    kind: 'Snake',
    label: 'Snake',
    maxHp: 10,
    damage: 4,
    speedPxPerSec: 25,
    detectionRadiusTiles: 2,
    attackRangeTiles: 1,
    spawnWeight: 3,
  },
  Coyote: {
    kind: 'Coyote',
    label: 'Coyote',
    maxHp: 18,
    damage: 5,
    speedPxPerSec: 70,
    detectionRadiusTiles: 5,
    attackRangeTiles: 1,
    spawnWeight: 2,
  },
  MountainLion: {
    kind: 'MountainLion',
    label: 'Mountain Lion',
    maxHp: 45,
    damage: 12,
    speedPxPerSec: 55,
    detectionRadiusTiles: 6,
    attackRangeTiles: 1,
    spawnWeight: 1,
  },
};

/** Distinct asset class again (small hostile creatures, unrelated to any building footprint or raid faction). */
export const WILDLIFE_ATLAS_KEY = 'wildlife-atlas';

/**
 * Same size class as animal/villager/raider sprites so every small unit reads
 * consistently at the same camera zoom.
 *
 * Phase 76 (visual overhaul): raised 12 -> 18 to match Phase 75's
 * ANIMAL_SPRITE_SIZE/RAIDER_SPRITE_SIZE bump - this was deliberately deferred
 * from Phase 75 (an independent literal, not an alias) so it ships alongside
 * the rest of the hostile-unit art (raiders, raider camps) in one phase. Like
 * ANIMAL_SPRITE_SIZE, this is a texture-generation/loading size only -
 * wildlife sprites are placed centred (`this.add.image`) and never
 * `setDisplaySize`d, so raising this constant alone is sufficient; no
 * placement-math follow-on site exists for wildlife the way
 * `getAnimalSlotPosition`'s ANIMAL_SLOT_STEP needed touching for animals in
 * Phase 75 (wildlife doesn't sit in a per-building slot grid).
 */
export const WILDLIFE_SPRITE_SIZE = 18;

export function wildlifeTextureKey(kind: WildlifeKind): string {
  return `wildlife-${kind}`;
}

/** Weighted random pick over WILDLIFE_DEFINITIONS' spawnWeight fields. */
export function pickRandomWildlifeKind(): WildlifeKind {
  const kinds = Object.keys(WILDLIFE_DEFINITIONS) as WildlifeKind[];
  const totalWeight = kinds.reduce((sum, kind) => sum + WILDLIFE_DEFINITIONS[kind].spawnWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const kind of kinds) {
    roll -= WILDLIFE_DEFINITIONS[kind].spawnWeight;
    if (roll <= 0) {
      return kind;
    }
  }
  return kinds[kinds.length - 1];
}
