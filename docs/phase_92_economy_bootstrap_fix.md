# Phase 92 – Economy Diagnosis + Bootstrap Fix

User's report: *"it is currently hard or impossible to get money."* This phase
is the **diagnosis and the numbers fix**. The discoverability half ("so I can
see what I get for each good, where I sell them") is Phase 93.

## Diagnosis — measured, not guessed

Built a throwaway Node harness that drives the **real** `gameState.ts`
(esbuild-bundled, Phaser aliased to a tiny EventEmitter shim) and played out
scripted openers on a real generated map through the real
`placeBuilding` / `buyAnimal` / `runProductionTick` / `tickTimer` APIs.

**Result: net worth only ever went DOWN.**

| scenario (5 min, Normal/Endless) | net worth |
|---|---|
| reasonable opener (4 House, Well, Chicken Farm, Forestry, Granary) | 1800 → **1347** |
| houses + well only | 1800 → 1430 |
| build literally nothing | 1800 → 1800 |

### Why

1. **Every autonomous money source was gated behind a net-worth threshold
   above the money you start with**: Warehouse 2200, Supermarket 2500,
   Brothel 3000, Saloon 3200, Bank 4000, Trading Post 5000 — versus
   `STARTING_MONEY` 1800. A falling number cannot cross a rising bar, so the
   first seller was **strictly unreachable by playing**. Bootstrapping
   deadlock, confirmed.
2. **Production stops paying after ~90 ticks.** Making goods *does* raise net
   worth (they're created from nothing), but the global storage cap (50/resource,
   +40 per Granary) saturates in ~3 minutes, after which output is discarded
   and upkeep keeps draining. Buildings are net-worth-neutral to buy (valued
   at cost), and upkeep is a 1:1 net-worth drain.
3. **Tier-1 Houses were a pure drain**: 0.5 upkeep, $0 tax, and tiering up
   needs a Church (200 + 8 Wood → Forestry → WoodCutter chain). The building
   the player is pushed to build first and most made the problem *worse* —
   measured at ~37% of a small town's gross upkeep.
4. **Forestry's entire output had no buyer.** Logs were a WoodCutter input and
   a Fence material and nothing else — an early Forestry looks productive on
   the HUD and earns exactly $0.
5. **Not a single Fence was placeable at t=0.** Found by scanning all 2700
   tiles with the real `getPlacementRejection`: Fence cost `{ logs: 1 }` and
   you start with 0 logs. Livestock needs a *closed* pen, so the
   always-unlocked Chicken Farm — the tutorial's own fourth step — was
   effectively gated behind the logs chain.

## The fix

### 1. Market Stall (new building) — the entry point to the sell economy

1x1, **$70, no materials, no unlock requirement**, upkeep 0.5, 1 worker.
Sells basic goods only: Eggs, Logs, Raw Meat, Potatoes (2/tick each) at the
live market price. Logs and Raw Meat become sellable for the first time.

Deliberately weak next to the Supermarket (no processed goods: meat, wood,
clothes, tools), so the Supermarket stays a genuine upgrade rather than being
obsoleted by something a quarter of its price.

Real AI-generated art via the existing pipeline (`generate_buildings.py
--batch MarketStall`, one batch call): all 6 state frames.

### 2. Tier-1 House tax $0 → $1/tick

A house now nets +0.5/tick instead of −0.5, and only while its Water need is
actually met (tax is collected in the same atomic block that consumes the
needs), so **Well → Houses → tax** is a real, legible first income lever.
Tier 2/3 stay clear upgrades at $2/$5.

### 3. Fence: `{ logs: 1 }` removed, money 6 → 8

Removes the t=0 hard blocker above. Walls/Gates keep their materials — they're
upgrades, not the first thing a town builds.

### 4. Refactor: one shared fixed-rate sales pass

`runSupermarketSales` and `runSaloonSales` were byte-identical loops differing
only in type, rate table and result field. Collapsed into
`runFixedRateSales(type, rates, assignSale)` rather than pasting a third copy.
Separate tables and separate result fields are kept (Phase 27's reasoning
still holds). `FIXED_RATE_SELL_TABLES` does the same for `describeBuilding`'s
duplicated tooltip blocks.

## Measured result (same harness, same scenario shape)

| | before | after |
|---|---|---|
| steady-state cash | −2.3/tick | **+2.4/tick** |
| net worth over 10 min | 1800 → 1347 | 1780 → **2450** |
| Warehouse unlock | never | ~6 min |
| Supermarket unlock | never | ~9 min |
| Saloon unlock | never | ~16 min |

Both money and net worth now rise monotonically from minute one.

**Net-worth unlock gates were deliberately left at their existing values.**
They were never wrong in themselves — they were unreachable because nothing
could push net worth up. With income restored they gate progression exactly as
Phase 47 intended, and re-tuning them on top of the income fix would have made
the effect of each change impossible to attribute.

## Verification

`npm run build`, `npm run lint`, `npm run verify:art` (7/7) clean.
`tools/verify-building-frames.mjs` and `tools/generate-placeholder-buildings.mjs`
both updated to 35 building types.
