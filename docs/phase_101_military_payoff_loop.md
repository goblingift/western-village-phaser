# Phase 101: Military Payoff Loop

## Goal

Rifles (Phase 94) gave defense a buff, but raider camps remained the only
offense in the game and their loot was a flat one-shot: all camps spawned once
per run, and clearing them ended the offense phase permanently. A standing army
had nothing to do between raids, and there was no reason to build one beyond
pure survival.

## Tasks

1. Scale camp loot with the existing escalation-tier system.
2. Consider a repeatable military-driven loop - explicitly scoped as "keep this
   modest; a well-reasoned scaled-loot-only is acceptable".

## Design decisions

### Loot tracks Phase 80's uncapped escalation tier

`getEscalationTier()` climbs 1, 2, 3... forever once net worth passes
`THREAT_NET_WORTH_FULL`, and raids scale with it (+35% raider HP per tier, elite
raiders from tier 2). The camp payout did not scale with anything, so the cost
of mounting an assault grew without limit while the reward stayed at $150.

Loot is now `base * (1 + tier * RAIDER_CAMP_LOOT_ESCALATION_PER_TIER)` (0.5 per
tier). Tier 0 pays exactly the pre-phase amounts, so nothing about the early
game changes.

**Camp HP is deliberately not scaled with it.** Camps are a small bounded
population, so a growing payout cannot be farmed by grinding weak targets; the
real cost of an assault is the army kept alive to make it and the town left
undefended while it marches.

### The repeatable loop is respawning camps, not a new mechanic

Rather than inventing a bounty board or patrol contract (new state, new UI, new
balance surface), the repeatable structure is that **camps re-establish**: from
the first dawn `RAIDER_CAMP_RESPAWN_INTERVAL_DAYS` (2) after the last camp
appeared, one new camp is founded whenever fewer than `RAIDER_CAMP_MAX_COUNT`
stand.

This was chosen because it needs no new systems at all - it reuses
`spawnRaiderCamp`, the existing loot path, the existing camp visuals, minimap
markers and attack-order targeting - and because it produces the right
incentive shape for free:

- A standing camp is **where raid waves come from** (`startRaid` sources a
  wave's faction and origin from a live camp), so ignoring a camp is not
  neutral - it costs the player raids.
- Clearing one costs the risk of marching defenders away from the town.
- The payout is therefore repeatable income that is genuinely earned by
  maintaining and using an army, not a faucet.

It rides the same `day-phase-changed` dawn event the initial spawn already uses,
so no second timer exists. When the camp population is already full the interval
clock still refreshes, so a player who never clears anything cannot bank up
instant respawns for the moment they finally do.

`lastCampSpawnDay` is scene-local and not persisted, matching every other piece
of raid scheduling state; `notifyLoadedDayNumber` restarts the interval from the
loaded day so loading a late save cannot found a camp on the very next dawn.

A new camp announces itself in the notification log (warning kind - it means new
raids come from it), since a camp founded at a random map edge is easy to miss.

## Verification

Loot scaling, against the real `getEscalationTier`:

```
net worth   1800 -> tier 0   loot $150 + 10 Tools   (identical to pre-Phase-101 values)
net worth  35800 -> tier 0   loot $150 + 10 Tools
net worth  65800 -> tier 1   loot $225 + 15 Tools
net worth 125800 -> tier 3   loot $375 + 25 Tools
net worth 215800 -> tier 6   loot $600 + 40 Tools
```

Respawn cadence, driving the real `RaidSystem` against a stub scene and emitting
real `day-phase-changed` events (camp counts shown after each dawn):

```
day 1: 0            (before RAIDER_CAMP_SPAWN_DAY)
day 2: 1            initial spawn
day 3: 1
day 4: 2  <- player cleared ALL camps this dawn
day 5: 0            interval not yet elapsed - the reward window
day 6: 1            respawn
day 7: 1  <- player cleared ALL camps again
day 8: 1            respawn
day 9: 1
day 10: 2
day 11: 2
day 12: 3           at the cap
```

## Status

`npm run build` and `npm run lint` pass clean. No art touched - no new building
or resource was introduced.
