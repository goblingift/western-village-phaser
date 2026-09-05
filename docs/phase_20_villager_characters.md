# Phase 20 – Villager Characters

## Goal

Population stops being just a HUD number. One small human character
per population unit wanders the built-up area of the map.

## Prompt for Claude Code

```text
Spawn and animate villager characters.

Tasks:
1. Small pixel-art human sprite (simple villager, Western flavor —
   hat/vest silhouette is enough at this scale), same PixelSprite
   system as animals (Phase 18), same size class.
2. One villager sprite per population CAPACITY unit (i.e. per House's
   POPULATION_PER_HOUSE, not per currently-employed count — employment
   is recomputed every tick and shouldn't churn sprites in/out).
   Spawn on House placement, despawn with game-reset. Cap total
   rendered villagers (e.g. 30) for performance even if population
   capacity exceeds that.
3. Movement: NOT real pathfinding. Each villager periodically picks a
   random placed building's footprint tile (or its own House) as a
   target and tweens straight-line to it over a duration scaled by
   distance (a walking-speed constant), then pauses briefly and picks
   a new target — loops forever. This is decorative "people live here"
   flavor, not a commute simulation tied to actual job assignment.
4. Directional flip (scaleX) based on horizontal movement, same
   lightweight technique as Phase 18's animals — no new walk-cycle
   frames needed.
5. Depth above buildings/animals, below UI.

Process:
1. Confirm the "wander to random building, not real pathfinding" scope
   and the population-capacity-based spawn count before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Placing a House spawns visible villagers
- [ ] Villagers visibly move toward different buildings over time, not frozen
- [ ] Villager count is capped and doesn't tank FPS as population grows
- [ ] `npm run build` passes, no console errors

## Completion

Closes this animation round: animals, buildings, and villagers all
have idle/wander motion.
