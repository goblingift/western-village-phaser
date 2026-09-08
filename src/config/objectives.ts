import {
  BUILDING_DEFINITIONS,
  BuildingType,
  MARKETABLE_RESOURCE_KEYS,
  MarketableResourceKey,
  RESOURCE_LABELS,
  ResourceKey,
  formatResourceMap,
} from './buildingConfig';

/**
 * Phase 56: Objectives / Quest Chain. A small, self-contained config module
 * (matching resourceGraph.ts's shape - pure data/derivation, no gameState
 * import) so gameState.ts can evaluate every definition's `getProgress`
 * against a plain snapshot object it builds itself each tick, rather than
 * this file reaching back into gameState and risking a cycle.
 *
 * `getProgress` returns the *current* value toward `target`, not a boolean -
 * gameState.runObjectivesCheck clamps it into `[0, target]` and treats
 * `progress >= target` as complete, and the same number backs the UI's
 * "32/50" readout. A definition never mutates anything; all the actual
 * counters it reads (cumulativeSold, totalUnitsTrained,
 * nightsSurvivedCleanCount) are tracked by gameState.ts as new module state.
 */
export interface ObjectiveSnapshot {
  /** Run-lifetime total of each resource ever sold via Supermarket/Saloon/Trading Post combined - never decrements, unlike the resource pool itself. */
  cumulativeSold: Partial<Record<ResourceKey, number>>;
  totalPopulation: number;
  /** computeNetWorth().total, read fresh each check - a snapshot only in the sense that it's evaluated once per tick, not cached across ticks. */
  netWorthTotal: number;
  /** Currently-standing Watchtower count (not cumulative-ever-built) - simplest read, and a Watchtower lost to raiders is a real loss the player should have to replace anyway. */
  watchtowerCount: number;
  /** Cumulative Cowboy + Cowboy-on-Horse units ever completed out of a training queue - unlike cowboyCount/mountedCowboyCount, never decrements when a unit dies. */
  totalUnitsTrained: number;
  /** Cumulative count of full night phases that ended with zero buildings lost during them - not required to be consecutive. */
  nightsSurvivedCleanCount: number;
  /**
   * Phase 81: lifetime "ever placed" count per BuildingType (gameState's
   * buildingsEverBuiltByType, already tracked for the Bug-2 game-over fix) -
   * used by generated-objective templates to gate their `isAvailable` check
   * on the town actually having (or having had) a relevant building, rather
   * than the live/current count, so a template doesn't go permanently stuck
   * if the player later demolishes or loses the building that unlocked it.
   */
  buildingsEverBuiltByType: Partial<Record<BuildingType, number>>;
}

export interface ObjectiveReward {
  money?: number;
  materials?: Partial<Record<ResourceKey, number>>;
}

export interface ObjectiveDefinition {
  id: string;
  description: string;
  target: number;
  /** Short unit label for the progress readout ("32/50 Clothes"); omitted for plain-number objectives like net worth, where the description already reads naturally with a bare "$3200/$5000". */
  unit?: string;
  getProgress: (snapshot: ObjectiveSnapshot) => number;
  reward: ObjectiveReward;
}

/**
 * Deliberately in a fixed, deterministic order rather than shuffled - the
 * rolling active-3 queue (gameState's objectiveQueue) walks this array in
 * declaration order, so two runs progress through the same quest sequence and
 * are comparable. Eight objectives spanning economy (sales/net worth),
 * population growth and military/survival, per the roadmap item's brief.
 */
export const OBJECTIVE_DEFINITIONS: ObjectiveDefinition[] = [
  {
    id: 'ship-50-clothes',
    description: 'Ship 50 Clothes',
    target: 50,
    unit: 'Clothes',
    getProgress: (s) => s.cumulativeSold.clothes ?? 0,
    reward: { money: 100 },
  },
  {
    id: 'reach-population-10',
    description: 'Reach Population 10',
    target: 10,
    unit: 'Population',
    getProgress: (s) => s.totalPopulation,
    reward: { money: 150 },
  },
  {
    id: 'survive-3-nights-clean',
    description: 'Survive 3 Nights Without Losing a Building',
    target: 3,
    unit: 'Nights',
    getProgress: (s) => s.nightsSurvivedCleanCount,
    reward: { money: 200 },
  },
  {
    id: 'build-3-watchtowers',
    description: 'Build 3 Watchtowers',
    target: 3,
    unit: 'Watchtowers',
    getProgress: (s) => s.watchtowerCount,
    reward: { materials: { wood: 10 } },
  },
  {
    id: 'reach-net-worth-5000',
    description: 'Reach Net Worth $5000',
    target: 5000,
    getProgress: (s) => s.netWorthTotal,
    reward: { money: 300 },
  },
  {
    id: 'ship-20-tools',
    description: 'Ship 20 Tools',
    target: 20,
    unit: 'Tools',
    getProgress: (s) => s.cumulativeSold.tools ?? 0,
    reward: { money: 250 },
  },
  {
    id: 'train-5-cowboys',
    description: 'Train 5 Cowboys',
    target: 5,
    unit: 'Cowboys',
    getProgress: (s) => s.totalUnitsTrained,
    reward: { money: 150 },
  },
  {
    id: 'sell-30-liquor',
    description: 'Sell 30 Liquor',
    target: 30,
    unit: 'Liquor',
    getProgress: (s) => s.cumulativeSold.liquor ?? 0,
    reward: { money: 120 },
  },
];

export const OBJECTIVE_DEFINITIONS_BY_ID: ReadonlyMap<string, ObjectiveDefinition> = new Map(
  OBJECTIVE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

/** "+$100" / "+10 Wood" / "+$100 +10 Wood" - the notification-log and UI text for a just-completed objective's payout. */
export function formatObjectiveReward(reward: ObjectiveReward): string {
  const parts: string[] = [];
  if (reward.money) {
    parts.push(`+$${reward.money}`);
  }
  if (reward.materials && Object.keys(reward.materials).length > 0) {
    parts.push(`+${formatResourceMap(reward.materials)}`);
  }
  return parts.join(' ');
}

/** "32/50 Clothes" / "$3200/$5000" (unit-less objectives fall back to a bare number pair) - shared by the objectives panel and any future tooltip. */
export function formatObjectiveProgress(definition: Pick<ObjectiveDefinition, 'target' | 'unit'>, progress: number): string {
  const rounded = Math.floor(progress * 10) / 10;
  if (!definition.unit) {
    return `$${rounded}/$${definition.target}`;
  }
  return `${rounded}/${definition.target} ${definition.unit}`;
}

/**
 * Phase 81: Procedural Endless Objectives. The 8 OBJECTIVE_DEFINITIONS above
 * are a fixed, hand-authored queue that runs out after a single playthrough -
 * fine for a Fixed-mode ~15 minute run, a permanently-blank ObjectivesPanel
 * for the rest of an Endless run. Rather than hand-author more (same dead
 * end, just later), gameState.ts's refillActiveObjectives() generates a new
 * ObjectiveDefinition on demand from one of these templates once the static
 * queue is empty. A template describes a FAMILY of objective plus how its
 * target/reward scale with a difficulty index (gameState's completed-
 * objective count) - see generateObjectiveFromTemplate below.
 *
 * Generated definitions are never added to OBJECTIVE_DEFINITIONS_BY_ID -
 * gameState.ts keeps them in its own runtime Map and resolves both of them
 * through one shared resolver, so a generated id can never silently miss a
 * lookup (see gameState.ts's resolveObjectiveDefinition doc comment for why
 * that specific bug would be so easy to reintroduce).
 */
export type ObjectiveTemplateId =
  | 'ship-resource'
  | 'train-units'
  | 'survive-nights'
  | 'net-worth'
  | 'build-more'
  | 'build-watchtowers';

/**
 * Every field a generator needs to rebuild an IDENTICAL ObjectiveDefinition
 * (including a working getProgress closure) from scratch - this is exactly
 * what gets persisted (gameState's GeneratedObjectiveSaveEntry), since a
 * closure can't survive JSON.stringify. Kept as one flat union rather than a
 * per-template interface so gameState.ts can store/round-trip it generically
 * without a switch of its own.
 */
export interface ObjectiveTemplateParams {
  resourceKey?: ResourceKey;
  buildingType?: BuildingType;
  /**
   * Snapshot value of the underlying counter at generation time, for any
   * template whose getProgress reads an absolute/cumulative counter
   * (totalUnitsTrained, nightsSurvivedCleanCount, watchtowerCount,
   * buildingsEverBuiltByType[x]) rather than something that naturally starts
   * near zero (cumulativeSold, netWorthTotal). Without this, "N More Units"
   * generated after the player already trained 5 units would read as already
   * complete the instant it appears - target must be baseline + delta, with
   * getProgress still returning the raw absolute count so it keeps working
   * unmodified after a save/load rehydration (Decision 6).
   */
  baseline?: number;
}

export interface ObjectiveTemplate {
  templateId: ObjectiveTemplateId;
  /** Only templates passing this against the current town state are eligible to be picked - Decision 5. Must be pure/side-effect-free, called every refill. */
  isAvailable: (snapshot: ObjectiveSnapshot) => boolean;
  /** Picks the concrete params (e.g. which resource/building) for one generated instance of this template - called once, at generation time only, never re-evaluated. */
  pickParams: (snapshot: ObjectiveSnapshot) => ObjectiveTemplateParams;
  /** Builds the final ObjectiveDefinition from template + params + a difficulty index (Decision 4: gameState's completed-objective count). Must be a pure function of its inputs so save/load rehydration (Decision 6) reproduces a byte-for-byte-equivalent definition. */
  build: (params: ObjectiveTemplateParams, difficultyIndex: number, generationSeq: number) => ObjectiveDefinition;
}

/** Sub-linear (Decision 4) growth curve shared by every template's reward scaling - proportional to sqrt of the difficulty index so a long run's rewards stay meaningful without inflating the economy. */
function difficultyRewardScale(difficultyIndex: number): number {
  return 1 + Math.sqrt(Math.max(0, difficultyIndex)) * 0.6;
}

/** Slightly gentler-than-linear target growth, still clearly bigger at higher indices without becoming a wall. */
function difficultyTargetScale(difficultyIndex: number): number {
  return 1 + Math.sqrt(Math.max(0, difficultyIndex)) * 0.8;
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * A resource is only ever chosen for the "Ship N more of X" template if the
 * town has ever built a building capable of producing it - checked via
 * buildingsEverBuiltByType against every BuildingType known to produce that
 * resource (production.outputs / harvest.outputs / animal.outputPerAnimal),
 * mirrors resourceGraph.ts's own "produces" definition without importing it
 * (this file stays a pure, gameState-independent config module).
 */
function findProducedMarketableResources(snapshot: ObjectiveSnapshot): MarketableResourceKey[] {
  return MARKETABLE_RESOURCE_KEYS.filter((key) =>
    Object.values(BUILDING_DEFINITIONS).some((definition) => {
      const everBuilt = (snapshot.buildingsEverBuiltByType[definition.type] ?? 0) > 0;
      if (!everBuilt) {
        return false;
      }
      return (
        definition.production?.outputs?.[key] !== undefined ||
        definition.harvest?.outputs[key] !== undefined ||
        definition.animal?.outputPerAnimal[key] !== undefined
      );
    }),
  );
}

/** Building types the "Build N more of Y" template will ever offer - production/harvest/animal buildings the player has already built at least one of, so the objective is a natural "build another" rather than introducing a brand-new building. */
function findRepeatableBuiltBuildingTypes(snapshot: ObjectiveSnapshot): BuildingType[] {
  return Object.values(BuildingType).filter((type) => {
    const definition = BUILDING_DEFINITIONS[type];
    const everBuilt = (snapshot.buildingsEverBuiltByType[type] ?? 0) > 0;
    const isProductive = Boolean(definition.production) || Boolean(definition.harvest) || Boolean(definition.animal);
    return everBuilt && isProductive;
  });
}

export const OBJECTIVE_TEMPLATES: ObjectiveTemplate[] = [
  {
    templateId: 'ship-resource',
    isAvailable: (s) => findProducedMarketableResources(s).length > 0,
    pickParams: (s) => {
      const candidates = findProducedMarketableResources(s);
      const resourceKey = candidates[Math.floor(Math.random() * candidates.length)];
      return { resourceKey };
    },
    build: (params, difficultyIndex, generationSeq) => {
      const resourceKey = params.resourceKey as ResourceKey;
      const label = RESOURCE_LABELS[resourceKey];
      const target = roundTo(20 * difficultyTargetScale(difficultyIndex), 5);
      const money = Math.round(4 * target * difficultyRewardScale(difficultyIndex));
      return {
        id: `gen-ship-${resourceKey}-${generationSeq}`,
        description: `Ship ${target} more ${label}`,
        target,
        unit: label,
        getProgress: (s) => s.cumulativeSold[resourceKey] ?? 0,
        reward: { money },
      };
    },
  },
  {
    templateId: 'train-units',
    isAvailable: () => true,
    pickParams: (s) => ({ baseline: s.totalUnitsTrained }),
    build: (params, difficultyIndex, generationSeq) => {
      const baseline = params.baseline ?? 0;
      const delta = roundTo(3 * difficultyTargetScale(difficultyIndex), 1);
      const target = baseline + delta;
      const money = Math.round(30 * delta * difficultyRewardScale(difficultyIndex));
      return {
        id: `gen-train-units-${generationSeq}`,
        description: `Train ${delta} More Units`,
        target,
        unit: 'Units',
        getProgress: (s) => s.totalUnitsTrained,
        reward: { money },
      };
    },
  },
  {
    templateId: 'survive-nights',
    isAvailable: () => true,
    pickParams: (s) => ({ baseline: s.nightsSurvivedCleanCount }),
    build: (params, difficultyIndex, generationSeq) => {
      const baseline = params.baseline ?? 0;
      const delta = roundTo(2 * difficultyTargetScale(difficultyIndex), 1);
      const target = baseline + delta;
      const money = Math.round(60 * delta * difficultyRewardScale(difficultyIndex));
      return {
        id: `gen-survive-nights-${generationSeq}`,
        description: `Survive ${delta} More Nights Without Losing a Building`,
        target,
        unit: 'Nights',
        getProgress: (s) => s.nightsSurvivedCleanCount,
        reward: { money },
      };
    },
  },
  {
    // Universally valid regardless of town state (Decision 5's required
    // guaranteed fallback) - net worth only ever grows off a healthy town, so
    // there's never a town shape where this can't eventually be satisfied.
    templateId: 'net-worth',
    isAvailable: () => true,
    pickParams: () => ({}),
    build: (_params, difficultyIndex, generationSeq) => {
      const target = roundTo(3000 * difficultyTargetScale(difficultyIndex), 500);
      const money = Math.round(150 * difficultyRewardScale(difficultyIndex));
      return {
        id: `gen-net-worth-${generationSeq}`,
        description: `Reach Net Worth $${target}`,
        target,
        getProgress: (s) => s.netWorthTotal,
        reward: { money },
      };
    },
  },
  {
    templateId: 'build-more',
    isAvailable: (s) => findRepeatableBuiltBuildingTypes(s).length > 0,
    pickParams: (s) => {
      const candidates = findRepeatableBuiltBuildingTypes(s);
      const buildingType = candidates[Math.floor(Math.random() * candidates.length)];
      return { buildingType, baseline: s.buildingsEverBuiltByType[buildingType] ?? 0 };
    },
    build: (params, difficultyIndex, generationSeq) => {
      const buildingType = params.buildingType as BuildingType;
      const baseline = params.baseline ?? 0;
      const label = BUILDING_DEFINITIONS[buildingType].label;
      const delta = roundTo(2 * difficultyTargetScale(difficultyIndex), 1);
      const target = baseline + delta;
      const materialsAmount = Math.round(6 * delta * difficultyRewardScale(difficultyIndex));
      return {
        id: `gen-build-${buildingType}-${generationSeq}`,
        description: `Build ${delta} More ${label}`,
        target,
        unit: label,
        getProgress: (s) => s.buildingsEverBuiltByType[buildingType] ?? 0,
        reward: { materials: { wood: materialsAmount } },
      };
    },
  },
  {
    // watchtowerCount is currently-standing, not cumulative - deliberately
    // NOT baselined (unlike train-units/survive-nights/build-more, whose
    // counters are cumulative-ever and could already exceed a small delta
    // target at generation time). A live count could in principle also
    // already exceed target (player already has 3+ Watchtowers standing), in
    // which case the objective simply completes on its very next tick -
    // acceptable since it still requires actually maintaining that many
    // Watchtowers, matching the static build-3-watchtowers objective's own
    // (non-baselined, absolute-threshold) shape exactly.
    templateId: 'build-watchtowers',
    isAvailable: () => true,
    pickParams: () => ({}),
    build: (_params, difficultyIndex, generationSeq) => {
      const target = roundTo(2 * difficultyTargetScale(difficultyIndex), 1);
      const money = Math.round(80 * target * difficultyRewardScale(difficultyIndex));
      return {
        id: `gen-watchtowers-${generationSeq}`,
        description: `Have ${target} Watchtowers Standing`,
        target,
        unit: 'Watchtowers',
        getProgress: (s) => s.watchtowerCount,
        reward: { money },
      };
    },
  },
];

export const OBJECTIVE_TEMPLATES_BY_ID: ReadonlyMap<ObjectiveTemplateId, ObjectiveTemplate> = new Map(
  OBJECTIVE_TEMPLATES.map((template) => [template.templateId, template]),
);

/**
 * Builds a concrete ObjectiveDefinition from a template id + params +
 * difficulty index. Used both for fresh generation (gameState's
 * refillActiveObjectives, which also calls the template's own pickParams
 * first) and for save/load rehydration (Decision 6: gameState's
 * restoreObjectivesState calls this directly with the PERSISTED params
 * instead of calling pickParams again, so a reloaded objective's resource/
 * building choice can never silently change out from under a save).
 */
export function generateObjectiveFromTemplate(
  templateId: ObjectiveTemplateId,
  params: ObjectiveTemplateParams,
  difficultyIndex: number,
  generationSeq: number,
): ObjectiveDefinition {
  const template = OBJECTIVE_TEMPLATES_BY_ID.get(templateId);
  if (!template) {
    throw new Error(`Unknown objective template id: ${templateId}`);
  }
  return template.build(params, difficultyIndex, generationSeq);
}
