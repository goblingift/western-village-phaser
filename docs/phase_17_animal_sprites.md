# Phase 17 – Animal Sprites (Static)

## Goal

Owned animals are visible on the map. Static only for now — no
walking/animation yet (explicitly deferred).

## Prompt for Claude Code

```text
Render owned animals as static sprites.

Tasks:
1. Small pixel-art critter sprite per animal type (Chicken, Pig, Cow) —
   follow the existing PixelSprite pattern in BootScene.ts.
2. For each placed farm, draw animalCount critter sprites scattered
   within/around its footprint (or adjacent fenced yard), up to its max.
   Fixed positions per slot index — no movement, no tweening.
3. Update the sprites whenever animalCount changes (buy) or on
   game-reset.
4. Keep it cheap: static image objects, not per-frame redraws.

Process:
1. Show sprite concept per animal + placement layout before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Buying an animal immediately shows one more critter on the map
- [ ] Animal sprites don't overlap/obscure the building itself
- [ ] No animation/movement (explicitly out of scope this phase)
- [ ] `npm run build` passes, no console errors

## Completion

Walking/animation is future work, not this round.
