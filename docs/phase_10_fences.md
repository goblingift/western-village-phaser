# Phase 10 – Fences for Cattle

## Goal

Add Fence as placeable connector/enclosure type, similar mechanic to Road but for cattle buildings (Cattle Farm, Cow Ranch).

## Prompt for Claude Code

```text
Add Fence building type.

Tasks:
1. Fence: cheap, placeable on grass, connects like Road (adjacency/BFS)
   but forms enclosures around cattle buildings instead of transport network.
2. Cow Ranch (Phase 9) requires being enclosed/adjacent to Fence for full
   output bonus (mirror Road's +10% connectivity bonus pattern).
3. Visual: pixel fence sprite, distinct outline like existing road/
   connection outline (Graphics object reuse).
4. Building-bar entry, cost, tooltip.

Process:
1. Confirm enclosure/adjacency rule (full ring vs any adjacent tile) before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Fence placeable, connects visually like Road
- [ ] Cow Ranch output bonus applies only when fenced per agreed rule
- [ ] No perf regression at 200 buildings
- [ ] `npm run build` passes, no console errors

## Completion

Completes cattle production chain synergy (Cow Ranch + Fence).
