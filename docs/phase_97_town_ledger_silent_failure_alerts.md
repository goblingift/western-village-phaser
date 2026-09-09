# Phase 97: Town Ledger & Silent-Failure Alerts

## Goal

Make the town's money legible, and close the silent-failure hole in the House
economy that Phase 92's fix depends on.

A sanity-check pass over Phase 92's economy fix confirmed it works when played
correctly (+1.05/tick, net worth 1779 -> 3746 over 30 minutes), but goes
negative under realistic conditions - notably a Well placed at water-distance 3,
whose throttled output only supports 2 houses instead of 5 (measured -1.5/tick,
net worth 1800 -> 1127 over 15 minutes).

The critical part is that this failure was **completely invisible**:
`runHouseNeeds` only ever called `addNotification` on a tier CHANGE, and a
Tier-1 House cannot drop below Tier 1, so the notification branch was
unreachable for exactly the houses carrying the early economy. The town's
primary income source could stop paying town-wide with zero feedback anywhere in
the game.

## Tasks

1. **House unmet-needs notification** - a real trigger, debounced with the same
   fire-once-on-transition / reset-on-recovery shape as Phase 44's stall and
   upkeep-unpaid triggers.
2. **Water supply-vs-demand ledger** in the Economy panel (Phase 93), including
   an explicit "N of M houses dry" count.
3. **Houses and sellers tracked in the Statistics panel** - they have no
   `production`/`harvest` config, which is what that panel keyed off, so the
   town's entire income side was invisible there.
4. **Per-building net income/expense** so "which building is bleeding me" is
   answerable.
5. **Fix the stale House tooltip** - `describeBuilding` hardcoded `$0/$2/$5`
   even though Phase 92 raised Tier 1's tax to $1.

## Design decisions

### The notification reuses the existing streak counter

`runHouseNeeds` already maintains `houseNeedsUnmetStreak` on the building for
the tier-hysteresis logic. A second tick counter for the notification could
drift from it, so the notification is gated on the same field against a new
`HOUSE_NEEDS_NOTIFY_TICKS` (3, matching `PRODUCTION_STALL_NOTIFY_TICKS`), with
only a `houseNeedsUnmetNotified: Set<string>` added for the fire-once semantics.
Cleared on the met branch (recovery), in `removeBuilding`, and in
`clearNotificationDebounceState`.

The message names the actual failing groups via a new
`describeUnmetHouseNeeds(status, tierConfig, churchServed)`, which reads the
per-group snapshot `runHouseNeeds` just built rather than re-deriving it from
the resource pool - the reported reason therefore cannot disagree with the check
that produced it. Church coverage is appended separately because it is not a
`HouseNeedGroup`; it lives on `HouseTierConfig.requiresChurch`.

### The water ledger reads back what happened, it does not re-derive it

A Well's real output is the product of a five-factor multiplier chain (distance
falloff, drought, dust storm, road connection, staffing). A second
implementation of that in the UI would inevitably drift, so `getWaterLedger()`
takes supply straight from Phase 49's resource history - the water genuinely
added to the pool last tick.

House demand is the one config-derived figure, and it has to be:
`runHouseNeeds` is atomic (it consumes only when every group is affordable), so
a dry House consumes *nothing*. Reading consumption back would report a shortage
as zero demand and hide the exact failure this is meant to surface.

`dryHouses` is index-aligned against `houseNeedsStatus` (which `runHouseNeeds`
pushes in `tierConfig.needs`' own order), not matched on label strings that
would break the moment a label is reworded.

### Cash flow is a side Map, not a `PlacedBuilding` field

`buildingCashFlow` follows the same convention as `productivityRecords` and the
Phase 44 debounce state: pure observation, keyed by buildingId, never read back
into a gameplay decision, reset at the top of every `runProductionTick`. Written
by every pass that moves `money` on a specific building's behalf - `runUpkeep`
(expense), the three fixed-rate sell passes and Trading Post (income),
`runHouseNeeds`' tax collection (income), `runBrothelIncome` (income).

Bank interest is deliberately excluded: it compounds into `bankBalance`, not
`money`, so counting it as income would overstate the town's cash position.

### Statistics panel coverage widened at the source, not in the UI

Rather than special-casing Houses and sellers in `StatisticsPanel`, the
`recordProductivityTick` calls were added at the real decision points in
`runHouseNeeds`, `runFixedRateSales` and `runTradingPostSales`, reusing the
existing blocker-priority wording convention (`Understaffed`, `No stock to
sell`, `No order filled`, `Needs unmet: Water`). The panel needed no filtering
logic at all.

## Acceptance criteria

- A House whose needs go unmet for 3 consecutive ticks produces one warning
  notification naming the missing need; no further notifications while it stays
  unmet; a fresh one after recovery and a later failure.
- The Economy panel shows Well output vs. house demand vs. other use, and an
  explicit dry-house count with a colour-coded verdict.
- Houses, Market Stall, Supermarket, Saloon and Trading Post appear in the
  Statistics panel with a meaningful block reason.
- Every building that moved money shows a net $/tick figure in both the info
  panel and the Statistics panel.
- The House tooltip reads Tier 1's real tax figure.

## Verification

Node harness driving the real `gameState.ts` (esbuild bundle, Phaser
`EventEmitter` shim), same technique as Phases 92/94/95.

**A single House, no Well:**

```
water ledger: {"supplyPerTick":0,"houseDemandPerTick":0.2,"otherDemandPerTick":0,"dryHouses":1,"totalHouses":1}
house cashflow: {"income":0,"expense":0.5,"net":-0.5}
house productivity: {"activeTicks":0,"totalTicks":10,"blockReason":"Needs unmet: Water"}
unmet-needs notifications: 1  ("A House has unmet needs (Water) - it pays no tax until supply returns")
```

Before this phase: zero notifications, `getBuildingProductivity` returned
`null`, and no cash-flow figure existed anywhere.

**After supplying water:**

```
ledger: dryHouses 0 of 1
cashflow: {"income":1,"expense":0.5,"net":0.5}     <- matches Phase 92's stated +0.5/tick
productivity: blockReason null
```

**Debounce/recovery:** draining water again fires a second notification (count
1 -> 2), confirming the recovery reset works and it is not a fire-once-ever flag.

**One Well, three Houses** (the exact fragility from the brief - a throttled
Well behind demand):

```
ledger: {"supplyPerTick":0.5,"houseDemandPerTick":0.6,"dryHouses":0,"totalHouses":3}
```

The panel reports "Wells are behind demand by 0.1/tick - houses are still paying
from the stockpile, but that will run out" *before* any house goes dry.

**Seller visibility:**

```
stall productivity (was null before Phase 97): {"activeTicks":0,"totalTicks":15,"blockReason":"No stock to sell"}
after stocking eggs: {"activeTicks":3,...,"blockReason":null}  cash {"income":5.3,"expense":0.5,"net":4.8}
```

## Status

`npm run build` (tsc --noEmit && vite build) and `npm run lint` both pass clean.
No art touched, so `verify:art` is unaffected.
