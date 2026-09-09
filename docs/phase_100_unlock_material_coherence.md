# Phase 100: Unlock/Material Coherence (Church & the Wood Gate)

## Goal

Church unlocks at `populationAtLeast: 4` but cost 8 Wood; Wood's only producer
(Wood-cutter) unlocks at `populationAtLeast: 8`. Church advertised itself as
buildable a full unlock tier before its materials could exist.

Fix that, and audit every other `unlockRequirement` against its own `materials`
for the same class of bug.

## The audit

A script cross-referenced every `BuildingDefinition.materials` entry against
`resourceGraph.getResourceProducers`' unlock requirements. Two distinct
categories came out.

### Genuine mismatches (same axis - population vs population), all fixed

| Building | Unlock | Material | Producer unlock |
|---|---|---|---|
| Gate | pop 3 | 1 Wood | Wood-cutter, pop 8 |
| Butcher | pop 4 | 5 Wood | Wood-cutter, pop 8 |
| Wooden Wall | pop 4 | 2 Wood | Wood-cutter, pop 8 |
| Wooden Gate | pop 4 | 3 Wood | Wood-cutter, pop 8 |
| Church | pop 4 | 8 Wood | Wood-cutter, pop 8 |
| Watchtower | pop 10 | 2 Tools | Blacksmith, pop 12 |

### Cross-axis flags - reported, deliberately NOT changed

Warehouse (net 2200), Supermarket (net 2500), Saloon (net 3200), Brothel (net
3000), Bank (net 4000), Trading Post (net 5000 + day 3), Horsery (day 3) and
Barracks (day 2) all take Wood and/or Tools while being gated on net worth or
day rather than population. The audit cannot compare those axes, and in
practice they are fine: net worth starts near `STARTING_MONEY` (1800), so a
$2200+ threshold already implies a developed town that has long since passed
population 8.

**One is worth flagging.** Barracks is gated on `dayAtLeast: 2` - a wall-clock
gate that arrives whether or not the town has grown - and costs 10 Wood, the
largest early Wood cost in the game. Combined with Watchtower (population 10, 6
Wood), that makes **every** defensive option dependent on the Forestry ->
Wood-cutter chain, which itself needs population 8 plus 8 workers to staff (both
buildings are 2x2, so 4 workers each - the entire population of four Tier-1
Houses). A player who reaches day 2 with a small town cannot build any defense
at all.

It is left alone because the mitigation is real (raids are night-only and cannot
fire before `RAID_EARLIEST_ELAPSED_MS`, so the earliest possible raid is the
night of day 2, and early waves are small) and because decoupling defense from
the wood chain is a balance decision with wider consequences than this item's
scope. Flagged here as a known, deliberate outcome rather than an oversight.

## Design decision: fix the COST, not the unlock

The brief allowed either raising Church's unlock or making Tier 2 reachable
another way. Raising the unlock was rejected for a specific reason.

Church's own doc comment states the design intent explicitly: reachable "off two
Tier-1 Houses' population alone, before any Tier-2 growth is needed" - i.e.
"reachable before it's required". That intent is correct and load-bearing,
because Church coverage is a hard gate on House Tier 2/3
(`HOUSE_TIER_CONFIG.requiresChurch`), which is to say a hard gate on population
growth beyond 2 per House - the very thing a player needs in order to afford the
wood chain in the first place. Raising the unlock would have made the wood chain
a prerequisite for the population growth that pays for the wood chain.

So the Wood cost was the mistake, not the gate. Church now costs 8 **Logs**,
from the always-unlocked Forestry - which also gives Forestry a real early-game
purpose (its Logs previously fed only Fence/Gate and the Wood-cutter that was
itself gated at population 8), and a frontier chapel built of logs is the more
western answer anyway.

The same reasoning was applied to the other four population-axis cases. Butcher
in particular could not simply be delayed: it is the first processor of the meat
chain and the natural follow-up to a Pig Farm at the same population-4 tier, so
delaying it would have stranded the whole early chain. Wooden Wall and Wooden
Gate are palisades - stacked logs, not sawn lumber - so Logs is both the
available material and the right one.

Watchtower is the one exception to the pattern: its 2 Tools were simply dropped
(6 Wood retained, since Wood-cutter's population 8 sits safely below
Watchtower's own 10). A wooden lookout on stilts needing manufactured steel
tools was never load-bearing, and a defensive building's advertised availability
needs to be true when a raid is inbound.

## Changes

- Church: `{ wood: 8 }` -> `{ logs: 8 }`
- Butcher: `{ wood: 5 }` -> `{ logs: 4 }`
- Gate: `{ logs: 2, wood: 1 }` -> `{ logs: 3 }`
- Wooden Wall: `{ wood: 2 }` -> `{ logs: 3 }`
- Wooden Gate: `{ wood: 3, logs: 2 }` -> `{ logs: 5 }`
- Watchtower: `{ wood: 6, tools: 2 }` -> `{ wood: 6 }`

No unlock requirement, cost, size, sprite or behaviour changed - materials only.

## Verification

Re-running the audit after the change: **zero** same-axis mismatches remain
(only the eight cross-axis flags above, all intentional).

End-to-end, driving the real `gameState.ts` with a minimal population-4 town
(two Houses, one Well, one Forestry) and nothing else:

```
start: money 1800 pop 0
Forestry placed (always unlocked): true
after 60 ticks (2 min): pop 4  money 1504  logs 50  wood 0
Church cost now: {"logs":8}
Church unlocked at tick: 3 | affordable (money AND materials) at tick: 12
Wood-cutter unlocked? false   <- would have been required for the old 8-Wood cost
Church actually placed: true
```

Church is buildable ~24 seconds after unlocking, at exactly the population tier
it advertises. The same run proves the old cost was unbuildable there: `wood`
sits at 0 for the full two minutes and Wood-cutter is still locked.

## Status

`npm run build` and `npm run lint` pass clean. No art touched.
