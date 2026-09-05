# Phase 18 – Animal Walking Animation

## Goal

Animals stop being static (Phase 17 explicitly deferred this). Each
owned animal wanders within a small area near its building.

## Prompt for Claude Code

```text
Animate owned animals: confined wander + directional flip.

Tasks:
1. No new walk-cycle frame art needed: "walking" reads fine at this
   scale via horizontal position drift + sprite flip (scaleX) on
   direction change + a small vertical bob. Keep it cheap.
2. Each animal sprite gets a repeating tween wandering within a small
   radius (~10-14px) of its assigned slot anchor (from Phase 17's
   deterministic slot layout) — never leaving that local area, so it
   still reads as contained by the Fence.
3. Randomize duration/delay per animal so they don't move in lockstep.
4. Movement starts when the sprite is created (placement or animal
   bought) and is cleaned up with the rest of the building's visuals
   on game-reset (existing pattern already destroys animalImages).

Process:
1. Confirm the tween approach (no new frame art) before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Animals visibly move over a few seconds, not frozen
- [ ] Movement stays within their building's local area (no roaming the map)
- [ ] No perf regression with many farms/animals on screen
- [ ] `npm run build` passes, no console errors

## Completion

Phase 19 does buildings, Phase 20 does villager characters.
