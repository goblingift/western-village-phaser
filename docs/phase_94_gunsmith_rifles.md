# Phase 94 – Tier-3 Chain: Gunsmith, Rifles, and Armed Defense

## Problem

- Every chain in the game was exactly **two steps** (raw material → one
  processor → sell). Nothing anywhere consumed a *processed* good to make
  something else, so Tools, Clothes and Wood were all terminal.
- **Economy and combat were fully decoupled**: military cost money + Tools at
  training time and nothing you produced afterwards made your town fight
  better.
- **Agave Juice was a pure dead end** — produced by the Cactus Milker,
  sellable at the Saloon, consumed by nothing (confirmed by the Phase 93
  audit).

## Changes

### 1. Gunsmith (new tier-3 processor)

2x2, cost 240 + 8 Wood + 3 Tools, upkeep 2, staffed,
`unlockRequirement: { populationAtLeast: 14 }` (above Blacksmith's 12, since
its inputs presuppose that chain running).

```
production: { inputs: { tools: 1, wood: 2, leather: 1 }, outputs: { rifles: 0.5 } }
```

The first building whose input side depends on **three separate chains at
once**: Stone/Iron/Coal → Blacksmith → Tools; Trees → Forestry → WoodCutter →
Wood; Cows → Cow Ranch → Leather. Output rate 0.5/tick is deliberately the
slowest in the game — one Rifle costs 2 Tools, 4 Wood and 2 Leather.

Uses the existing `production.inputs`/`outputs` shape; no new mechanic class.

### 2. Rifles as a real military input

New `rifles` `ResourceKey` (value 35, above Tools' 20). Chosen mechanic: a
**buff with a sink**, not a gate.

- `RIFLE_AMMO_PER_SHOT` (0.05) is spent per shot, by units *and* Watchtowers,
  via `gameState.consumeRifleAmmo()`;
- an armed shot hits for `RIFLE_DAMAGE_MULTIPLIER` (1.5×);
- an empty armoury simply returns 1 — a town with no Gunsmith fights exactly
  as it did before this phase.

**Why not a gate:** gating training or firing on Rifles would soft-lock a town
that lost its Gunsmith to a raid at precisely the moment it needed to shoot
back. One ammo check per *shot* (not per damage application), so a Dynamiter's
splash rides the same armed/unarmed decision as its primary hit rather than
being charged twice.

Rifles are also sellable at the Supermarket, but at **1/tick** rather than the
usual 2 — every Rifle on the shelf is either $35 or a 50%-harder-hitting
defense, never both. That tension is the point.

### 3. Agave Juice's second consumer

Added as a third option in House Tier 3's luxury need group:
*"Clothes, Liquor or Agave Juice"* (0.15/tick). Options are tried in declared
key order, so a household still prefers Clothes, then Liquor, and only falls
back to Agave Juice. Zero new mechanics — `HouseNeedGroup` already supports
an arbitrary option set.

### 4. Pipeline: new resource icons no longer risk corrupting old ones

`generate_remaining.py` regenerates resource icons in fixed batches of 4 keyed
by index, so adding a 16th `ResourceKey` changes the last batch's membership —
re-running it would re-crop a cached 3-cell image as 4 cells and silently
corrupt three good icons. New `tools/asset_generation/generate_resource_icon.py`
generates one named icon and repacks the atlas from every cached frame, with a
`--repack-only` mode that makes no API call at all.

## Art

Real generated art via the existing pipeline, one batch call each: `Gunsmith`
(walled workshop, racked rifles in the window, painted GUNSMITH sign — visibly
distinct from the Blacksmith's open anvil/forge) with all 6 state frames, and
the `rifles` HUD icon. Both converted to WebP.

## "Derived systems pick it up for free" — verified, not assumed

Ran the real modules under Node:

| system | result |
|---|---|
| `resourceGraph` | `rifles` producers → `[Gunsmith]`; `tools` consumers now include `Gunsmith`; **`agaveJuice` consumers now include `House`** |
| chain overlay | `getResourceChainBuildingTypes('rifles')` → Gunsmith, Supermarket, TradingPost |
| `ResourceHudPanel` | layout derives from `Object.keys(RESOURCE_LABELS).length`; 16th row added with no layout code |
| `StatisticsPanel` | iterates tracked history keys; no change |
| persistence | a legacy save with no `rifles` key restores to **0, not undefined** (fresh `emptyResources()` pool + `Object.assign`) — verified by round-tripping a payload with the key deleted |
| ammo | 1 Rifle = exactly 20 armed shots, then `consumeRifleAmmo()` returns false and damage falls back to base |

## Verification

`npm run build`, `npm run lint`, `npm run verify:art` (7/7) clean. Verify
tables updated to 36 buildings / 16 resource icons / the new 768x48 icon atlas.
