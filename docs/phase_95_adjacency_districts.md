# Phase 95 – Adjacency & District Synergy

## Problem

Placement was a solved non-problem. A Butcher next to its own Pig Farm
performed *identically* to one built across the map — the only spatial
modifiers in the game were the flat road-connected 1.1x and a couple of binary
terrain gates (Well/water, Quarry/gravel).

## The rule (exact formula, documented in `constants.ts`)

```
adjacencyMultiplier = 1 + ADJACENCY_BONUS_PER_INPUT (0.08)
                        × (number of DISTINCT production inputs that have a
                           producer within ADJACENCY_RADIUS_TILES (4))
```

Chebyshev distance, footprint-centre to footprint-centre (`getHarvestCenterTile`
— the same centre every other radius mechanic uses).

**Per distinct input, not per nearby producer.** Five Pig Farms around one
Butcher is worth exactly the same as one; a Pig Farm *and* a Well is worth
double. The reward is for clustering a real chain, and it caps naturally at
the building's own input count — Butcher +16% max, Blacksmith +24% max.

8% is deliberately modest because it **multiplies onto** an existing chain
(road bonus, dust storm, drought, cattle disease, well-distance falloff, crop
irrigation) — a large value would compound into something wild. It's folded
into that same `bonus` variable in `runProductionTick`, not added as a second
pass, so there is exactly one place output is scaled.

A supplier counts if it is **standing and finished** — it does *not* have to be
staffed or producing this tick. Adjacency is a property of *where you built*;
flapping the bonus whenever a supplier briefly lost a worker would make it
unreadable, and would make the placement preview a lie (the preview can only
ever show the standing-buildings answer).

## The trade-off: residential nuisance

A House within `INDUSTRY_NUISANCE_RADIUS_TILES` (3) of a `HEAVY_INDUSTRY_TYPES`
building collects `HOUSE_INDUSTRY_TAX_PENALTY_PER_SOURCE` (25%) less tax per
source, capped at 75%. Heavy industry = the noisy/dirty processors and
extraction sites (Butcher, Sewery, WoodCutter, Liquor Still, Blacksmith,
Gunsmith, Quarry, Iron Mine, Coal Mine) — deliberately **not** farms or
Forestry, since a frontier town grew up around its fields and penalising them
would make the earliest, most necessary layout the wrong one.

Expressed as a fraction of the tier tax (not a flat amount) so it stays
meaningful at Tier 3's $5/tick as well as Tier 1's $1. Numerically identical
to raising the House's upkeep, but applied to the tax side so it can't push a
household into the upkeep-unpaid/disabled branch, and so it appears right next
to the tax figure.

Net effect: production wants to cluster, housing wants to spread — an actual
zoning decision instead of pure bonus-chasing.

## UI

- **Info panel**: `Supply chain: +8% output - Raw Meat produced nearby (still
  far from Water)`, or an explicit no-bonus line naming what to move closer.
  For a House: `Industry nearby: 2 within 3 tiles - tax -50% (now $0.5/tick)`.
- **Placement preview + selection**: reuses the existing harvest-radius ring
  machinery (`drawServiceRing`, the shared square/Chebyshev primitive) — green
  once at least one input has a producer inside, red while none do. A square
  ring is correct here, not a circle, because Chebyshev is exactly what
  `getAdjacencyStatus` measures.

One implementation (`getAdjacencyStatus`) serves the tick, the panel and the
preview, taking a tile position rather than a `PlacedBuilding` so the preview
can ask about a building that doesn't exist yet — the same reason
`getHarvestCenterTile` is shared, and the guarantee that what the preview
promises and what the tick pays cannot diverge.

## A bug this design avoided

`getBuildingOutputKeys` (new, in `buildingConfig`) unions
`production.outputs` + `animal.outputPerAnimal` + `harvest.outputs`. A
livestock farm declares an *empty* `production` block and makes everything
through its `AnimalConfig`, so an outputs-only check would have reported a Pig
Farm as producing nothing — and adjacency would have silently never fired for
the game's most obvious chain.

## Verification

Scripted against the real `gameState` on a real map:

| scenario | result |
|---|---|
| Butcher alone | `multiplier 1`, missing `[rawMeat, water]` |
| Pig Farm placed within 4 tiles, still under construction | `multiplier 1` (correctly ignored) |
| same Pig Farm, finished | `multiplier 1.08`, supplied `[rawMeat]`, missing `[water]` |
| House within 3 tiles of the Butcher | `1 source, taxPenaltyFraction 0.25` |

`npm run build`, `npm run lint` clean.
