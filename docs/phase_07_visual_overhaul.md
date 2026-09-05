# Phase 7 – Visual Overhaul (Pixel Assets)

## Goal

Replace placeholder shapes with pixel-art tiles/sprites. Foundation for all later phases (new buildings, fences, minimap reuse same atlas).

## Prompt for Claude Code

```text
Rework visuals to pixel-art style.

Tasks:
1. Source/generate pixel-art tileset for ground (grass, water, sand) and
   building sprites (cattle farm, butcher, well, house, road), 16x16 or 32x32.
2. Pack into texture atlas(es), replace current procedural/placeholder graphics.
3. Keep existing building bar, HUD, tooltips working with new sprites.
4. Verify perf (viewport culling, atlas count) still holds at 200 buildings.

Process:
1. Propose tile size, atlas layout, asset source (generated vs external, license-safe).
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Ground tiles and buildings render as pixel art, no placeholder shapes left
- [ ] Atlas-based rendering preserved (perf unchanged)
- [ ] `npm run build` passes, no console errors
- [ ] Western color palette preserved/improved

## Completion

Unlocks consistent art base for Phase 8 (Harvesting), Phase 9 (New Buildings), Phase 10 (Fences), Phase 11 (Minimap).
