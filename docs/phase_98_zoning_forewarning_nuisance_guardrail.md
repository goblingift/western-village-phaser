# Phase 98: Zoning - Placement Forewarning + Nuisance Guardrail

## Goal

Phase 95 shipped an adjacency/nuisance system that the placement preview said
nothing at all about, and whose penalty could invert a House from a small
earner into a net drain.

## Tasks

1. `getPlacementWarning` branches in **both** directions - House near existing
   heavy industry, and heavy industry near existing Houses.
2. Draw `INDUSTRY_NUISANCE_RADIUS_TILES`' ring on the placement preview, reusing
   the existing `drawServiceRing` primitive.
3. A guardrail so the nuisance penalty can never push a House net-negative.
4. Strictly advisory - never blocks placement.

## Design decisions

### The guardrail floors net tax at the House's own upkeep

The stated invariant is "a badly-zoned House should always still contribute
>= $0 net, never go negative purely from the nuisance penalty". Two mechanisms
were on the table; they are not equivalent.

- **Capping the penalty at 50%** leaves Tier 1 at $0.50 tax against a $0.50
  upkeep - exactly break-even on Normal, but **still negative on Hard**, where
  `DIFFICULTY_SETTINGS.hard.upkeepMultiplier` (1.3) scales upkeep to $0.65 while
  the tax is not scaled at all. It also silently breaks again the next time
  anyone retunes `taxPerTick`, `upkeep`, or a prestige upkeep discount.
- **Flooring net tax at the House's actually-billed upkeep** states the
  invariant directly and holds under every difficulty and prestige combination
  by construction.

The floor is itself capped at `grossTax` (`Math.min(grossTax, houseUpkeep)`) so
it can only ever *reduce* a penalty, never hand out tax the House does not owe -
important if a future rebalance ever puts a tier's tax below its upkeep.

`HOUSE_INDUSTRY_TAX_PENALTY_MAX` stays at 0.75. The fraction still applies in
full to Tier 2/3, where it costs real profit without approaching the floor;
only Tier 1, where the numbers are small enough for the penalty to invert the
building, ever hits the guardrail.

To bill from the same figure as `runUpkeep`, its inline
`difficulty x prestige` product was extracted into a shared
`getUpkeepMultiplier()` - a second hand-written copy would have diverged the
first time either modifier changed.

### Warnings are symmetric because the mistake is symmetric

A player can zone badly from either end: dropping a Butcher into a residential
cluster, or infilling houses around an existing industrial district. The
industry-side check needed a new `countHousesInNuisanceRange`, deliberately
written with the same standing-and-finished rule and the same Chebyshev
centre-to-centre measurement as `getIndustryNuisance` - it is the same
relationship measured from the other end, and any divergence would let the
preview promise something the tick does not deliver.

The zoning branches sit after the harvest/crop branches in
`getPlacementWarning` (which return early). That is safe only because those
families are disjoint from Houses and `HEAVY_INDUSTRY_TYPES` today, which is
noted in the code: if it ever stops being true, "this will produce nothing" is
the stronger message to lead with anyway.

### The ring is a third colour, drawn in addition to the adjacency ring

Six of the nine `HEAVY_INDUSTRY_TYPES` have production inputs and therefore
already draw Phase 95's green adjacency ring (radius 4). The nuisance ring
(radius 3) is drawn *in addition*, not instead - siting a Butcher is exactly the
decision where you need to see both what it gains from its suppliers and what it
costs the households it lands on. Two concentric rings in the same green/red
palette would read as one shape, so `drawServiceRing` gained an optional
`colorOverride` and the nuisance ring uses orange, matching the advisory
register of the placement hint text.

It is drawn for House previews too (the same relationship, other end) and always
- not only when something is already inside it - because the point is to let a
player position *around* the radius, which needs it visible on empty ground.

## Acceptance criteria

- Placing a House near heavy industry warns, naming the source count and the
  tax drop; placing heavy industry near Houses warns, naming the house count and
  the per-source penalty.
- Neither warning blocks placement (the preview stays green).
- A House surrounded by three heavy-industry buildings nets >= $0/tick on Easy,
  Normal and Hard.
- The nuisance ring is visible on both building families' previews.

## Verification

Node harness driving the real `gameState.ts`, three heavy-industry buildings
(Quarry, WoodCutter, Butcher) placed within 3 tiles of one Tier-1 House.

**Guardrail, all three difficulties** (`net >= 0` is the invariant):

```
easy:   tax={"gross":1,"net":0.38}  cash={"income":0.38,"expense":0.38,"net":0.01}  -> true
normal: tax={"gross":1,"net":0.5}   cash={"income":0.5,"expense":0.5,"net":0}       -> true
hard:   tax={"gross":1,"net":0.65}  cash={"income":0.65,"expense":0.65,"net":0}     -> true
```

Before the guardrail the same Normal case was `gross $1 x (1 - 0.75) = $0.25`
income against `$0.50` upkeep, i.e. **-$0.25/tick** - the House inverted into a
drain. A flat 50% penalty cap would have fixed Normal but left Hard at `$0.50`
tax against `$0.65` upkeep, i.e. **-$0.15/tick**.

**Warnings, both directions:**

```
House on empty ground:            null
House next to 3 industry:         "3 heavy industry within 3 tiles - this House's tax drops 75%"
Butcher next to 1 House:          "1 House within 3 tiles - each loses 25% of its tax"
Butcher far away:                 null
```

Both checks correctly ignore buildings still under construction (the first
industry-side check returned `null`/`0` while the House was mid-build, matching
`getIndustryNuisance`'s existing standing-and-finished rule, and returned 1 once
it finished).

## Status

`npm run build` and `npm run lint` pass clean. No art touched.
