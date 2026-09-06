import {
  BUILDING_DEFINITIONS,
  BuildingType,
  HOUSE_TIER_CONFIG,
  MARKETABLE_RESOURCE_KEYS,
  ResourceKey,
  SALOON_SELL_RATES,
  SUPERMARKET_SELL_RATES,
} from './buildingConfig';

/**
 * Phase 48: Chain Encyclopedia & Resource Tooltips. A static producer/consumer
 * lookup derived by scanning BUILDING_DEFINITIONS (plus HOUSE_TIER_CONFIG and
 * the two autonomous-sell rate tables) rather than a hand-maintained table -
 * recomputed on demand each call, which is cheap enough at ~20 building types
 * that caching would only add a staleness risk with no measurable benefit.
 *
 * "Produces" deliberately checks three places, not just `production.outputs`:
 * `harvest.outputs` (Forestry/Cactus Milker draw from vegetation instead of a
 * flat production rate) and `animal.outputPerAnimal` (CattleFarm/PigFarm/
 * CowRanch/ChickenFarm all declare an empty `production: {}` and make
 * everything through their AnimalConfig - a lookup that skipped this would
 * report zero producers for rawMeat, leather and eggs).
 */
export function getResourceProducers(key: ResourceKey): BuildingType[] {
  const producers: BuildingType[] = [];
  for (const definition of Object.values(BUILDING_DEFINITIONS)) {
    const viaProduction = definition.production?.outputs?.[key] !== undefined;
    const viaHarvest = definition.harvest?.outputs[key] !== undefined;
    const viaAnimal = definition.animal?.outputPerAnimal[key] !== undefined;
    if (viaProduction || viaHarvest || viaAnimal) {
      producers.push(definition.type);
    }
  }
  return producers;
}

/**
 * "Consumes" covers `production.inputs`, House's HOUSE_TIER_CONFIG need
 * groups (any tier, any option inside an "or" group) and the Supermarket/
 * Saloon autonomous-sell tables - a sold resource leaves the pool exactly
 * like a production input, just via runSupermarketSales/runSaloonSales
 * instead of the main production loop.
 */
export function getResourceConsumers(key: ResourceKey): BuildingType[] {
  const consumers: BuildingType[] = [];
  for (const definition of Object.values(BUILDING_DEFINITIONS)) {
    if (definition.production?.inputs?.[key] !== undefined) {
      consumers.push(definition.type);
    }
  }

  const isHouseNeed = Object.values(HOUSE_TIER_CONFIG).some((tierConfig) =>
    tierConfig.needs.some((group) => group.options[key] !== undefined),
  );
  if (isHouseNeed) {
    consumers.push(BuildingType.House);
  }

  if (key in SUPERMARKET_SELL_RATES) {
    consumers.push(BuildingType.Supermarket);
  }
  if (key in SALOON_SELL_RATES) {
    consumers.push(BuildingType.Saloon);
  }
  // Phase 51: a Trading Post CAN trade any marketable resource, even before
  // the player has actually configured an order for it - "consumer" here
  // means capability, matching how Supermarket/Saloon are listed regardless
  // of whether they're currently staffed/selling this tick.
  if ((MARKETABLE_RESOURCE_KEYS as ResourceKey[]).includes(key)) {
    consumers.push(BuildingType.TradingPost);
  }

  return consumers;
}

export function getResourceProducerLabels(key: ResourceKey): string[] {
  return getResourceProducers(key).map((type) => BUILDING_DEFINITIONS[type].label);
}

export function getResourceConsumerLabels(key: ResourceKey): string[] {
  return getResourceConsumers(key).map((type) => BUILDING_DEFINITIONS[type].label);
}

/**
 * Every building type that either produces or consumes `key` - the exact set
 * the chain-view map overlay (MainScene.redrawChainViewHighlight) highlights.
 * Kept as one Set (rather than two separate producer/consumer sets) since the
 * overlay draws both the same way; BuildingInfoPanel/tooltips that need to
 * tell them apart use getResourceProducers/getResourceConsumers directly.
 */
export function getResourceChainBuildingTypes(key: ResourceKey): Set<BuildingType> {
  return new Set([...getResourceProducers(key), ...getResourceConsumers(key)]);
}
