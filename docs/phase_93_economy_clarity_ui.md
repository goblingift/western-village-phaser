# Phase 93 – Economy Clarity UI

The discoverability half of the user's request: *"make it clearer... so I can
see what I get for each good, where do I sell them."* Phase 92 fixed the
numbers; this makes the economy legible.

## Audit of what already existed

| surface | what it answered | what it didn't |
|---|---|---|
| Resource HUD tooltip (Phase 48) | stock, net rate, market price, producers, consumers | never said a good's *sell outlet* — "Consumed by: Supermarket" reads like the good is being eaten, not sold |
| Help panel chains (Phase 64) | who makes / who uses each good | no prices, no rates, no "where does this become money" |
| Statistics panel (Phase 49) | production rates, per-building uptime | nothing about value or selling |
| Building info panel | Consumes / Produces | never said what to *do* with the output |

Verdict: the data was all reachable, but nothing anywhere in the game
answered "what is this worth and who buys it". That is a UI problem, and it's
exactly what the player asked for.

## Changes

### 1. New Economy panel (`src/ui/EconomyPanel.ts`) — **M** hotkey / "Economy" button

A read-then-close modal (same pattern as `HelpOverlay`; every screen corner is
already taken by one of the nine existing panels), deliberately **sell-oriented**:

- **Goods you can sell** — one row per resource: live stock, net rate, live
  market price, and every outlet as *"Market Stall (2/tick, ~$3)"*, plus
  "Trading Post (manual order)" where applicable.
- **Goods with no buyer (inputs only)** — the goods that will never make
  money directly, with what makes them and what needs them, so a player
  stockpiling Stone knows it's waiting on a Blacksmith rather than being
  quietly worthless.
- A plain-language note that selling is automatic and staffing-gated (a
  genuine point of confusion: nothing in the game is ever clicked to sell),
  and that dumping depresses prices.

Everything is derived from `BUILDING_DEFINITIONS`, the three fixed-rate sell
tables, `resourceGraph` and `state/market` — never hand-listed, so it can't
drift the next time a chain is added. Re-renders only while open.

### 2. Resource tooltip: explicit "Sold at" line

`ResourceHudPanel.formatSoldAtLine` adds the sell outlets with their per-tick
rate as their own line, and — importantly — says so outright when there is no
buyer: *"Sold at: nowhere - input only, never sells for money"*, rather than
leaving the player to infer it from an absence.

### 3. Building info panel: "Sell:" line

`BuildingInfoPanel.formatSellHint` answers "Produces: 1.2 Logs — and then
what?" at the moment the player is looking at the producer:
*"Sell: Logs at Market Stall"*, or for an input-only good
*"Sell: Stone (no buyer - feeds Blacksmith)"*. Covers all three ways a
building can produce (`production.outputs`, `animal.outputPerAnimal`,
`harvest.outputs`) — a Chicken Farm declares an empty `production` block and
makes everything through its animals, so an outputs-only check would have
skipped every farm.

### 4. Shared `isMarketableResource`

Promoted out of a private copy in `ResourceHudPanel` into `buildingConfig`,
since both panels need the same type guard.

## Verification

Derivation checked by running the real `buildingConfig`/`resourceGraph` under
Node and printing the table the panel renders. All 15 resources correct:
11 sellable with outlets and rates, 4 (Water, Leather, Stone, Iron, Coal —
Coal being the fifth) correctly reported as input-only with their consumer
named.

`npm run build`, `npm run lint` clean.

## Note for Phase 94

The audit confirms Agave Juice is sold at the Saloon but consumed by nothing —
a genuine dead end, and one of the Tier-3-chain phase's explicit targets.
