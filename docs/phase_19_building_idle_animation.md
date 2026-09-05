# Phase 19 – Building Idle Animation

## Goal

Buildings get a small ambient idle animation accent — not functional,
just game-feel.

## Prompt for Claude Code

```text
Add one animated accent per notable building type.

Tasks:
1. Well: crank/bucket-arm accent oscillates rotation back and forth
   (small yoyo rotation tween).
2. Warehouse: hay-loft door accent swings slightly (rotation or
   position yoyo tween).
3. Supermarket: awning accent sways/shimmers (subtle scaleX or
   position yoyo tween).
4. Chicken Farm: coop door accent flaps open/closed (scaleY or
   visibility yoyo tween).
5. House: small rising smoke puff from the roof (a couple of small
   circle graphics cycling position-up + fade-out + reset, staggered).
6. Each accent is a small separate GameObject layered above the
   building's static image (same depth-10-plus-a-bit pattern as
   Phase 17/18's animal sprites), created alongside the building visual
   and cleaned up on game-reset with the rest.

Process:
1. Confirm which 5 buildings get accents and the animation type per
   building before coding (list above is the default — adjust only if
   something doesn't read well at 32-64px).
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Each of the 5 buildings shows a visible idle animation loop
- [ ] Animations are subtle, don't distract from gameplay HUD/info
- [ ] No perf regression with many buildings placed
- [ ] `npm run build` passes, no console errors

## Completion

Phase 20 adds villager characters walking the map.
