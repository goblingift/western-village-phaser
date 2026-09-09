# Phase 96 – Tutorial Expansion

The tutorial covered House → Well → Chicken Farm → buy-an-animal and then
stopped. Everything else — fences, the construction delay, unlock gates,
storage caps, raids, and (after Phase 92) the entire idea that you have to
build a *seller* — was learned by accident.

Per the brief: **content only**. The existing docked-card, non-modal,
event-driven, don't-replay pattern is unchanged.

## 1. Two new linear steps (things the player cannot start without)

- **Step 4 — Fence a pen around it.** Previously deferred and merely
  *mentioned*. That was a real defect, not just a gap: an animal genuinely
  cannot be bought without a closed pen, so the old "Step 4 – stock it with
  animals" was unachievable for a player who didn't already know how. Now its
  own step, teaching drag-to-lay and pointing at the info panel's
  `Enclosure: ...` line, which already names the exact problem.
- **Step 6 — Build a Market Stall.** After Phase 92 this is the single most
  important lesson in the game: **nothing is ever clicked to sell**, so
  without a seller a player watches goods pile up while money falls. Stated
  in exactly those words.

The old step 4 (buy an animal) survives as step 5, and the wrap-up now points
at **M** (economy) as well as **H** (help).

## 2. Contextual one-shot tips (everything else)

The brief preferred these over a longer script, and they're the right shape:
each covers something that happens on *the game's* schedule rather than the
player's, so a linear step would either block waiting for it or explain it
minutes before it mattered.

| tip | fires on |
|---|---|
| **Buildings take time to build** | the first `building-placed` ever — the construction delay reads as a bug ("I built it and nothing happened") the first time it's seen |
| **New buildings unlocked** | the first `building-unlocked` |
| **Storage is full** | the first `production-tick` where any resource is at `getStorageCap()` |
| **Night falls** | the first `day-phase-changed` into night |
| **Raw goods are worth more processed** | placing the first building that produces Raw Meat |

Each fires **once ever** (persisted in `western-village-tips-seen`, same
storage-failure contract as the seen-flag: a failure means a tip may repeat,
never that the run crashes). Tips **queue** rather than interrupt — they never
overwrite the linear script or each other, and anything that fired while the
script was running shows in order once it finishes. `game-reset` drops a
stale queue.

## 3. One supporting change outside the UI

`gameState.checkBuildingUnlocks` now emits a real `'building-unlocked'` event
alongside its existing notification. The alternative was string-matching
notification text, which is exactly the kind of coupling that breaks silently
when someone rewords a message.

## Verification

Driven against the compiled module with a DOM stub:

```
1 after reset:            Welcome to Western Village
3 wrong building ignored: Step 1 - Build a House      (placing a Road does not satisfy it)
4..9                      Well -> Chicken Farm -> Fence -> animals -> Market Stall -> You're running
10 finished. seenFlag: true | showing: Buildings take time to build   (queued during the script)
11 tips shown in order:   construction, unlock, night                 (second unlock did NOT re-queue)
12 hidden after draining  | persisted: ["construction","unlock","night"]
13 second reset:          (hidden)   - does not auto-replay
14 place another House:   (hidden)   - construction tip does not repeat
```

`npm run build`, `npm run lint`, `npm run verify:art` (7/7) clean.
