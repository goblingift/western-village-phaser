# Phase 11 – Minimap

## Goal

Add minimap overlay, top-left corner, showing full 40x30 map + camera viewport + building markers.

## Prompt for Claude Code

```text
Add minimap UI.

Tasks:
1. Fixed-position minimap panel, top-left corner, small scale render of
   full tilemap (grass/water/sand as flat colors is fine, no need for
   full pixel detail here).
2. Show building markers (colored dots per building type).
3. Show current camera viewport as rectangle outline.
4. Click/drag on minimap moves main camera to that position.
5. Keep minimap updates cheap (throttle redraw, don't run every frame
   unless camera/buildings changed).

Process:
1. Propose minimap size/placement/redraw strategy.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Minimap visible top-left, doesn't block building bar/HUD
- [ ] Shows terrain, buildings, camera viewport rectangle
- [ ] Click/drag navigates main camera
- [ ] No perf regression (throttled updates)
- [ ] `npm run build` passes, no console errors

## Completion

After this phase, all 5 requested features (minimap, pixel art, 3 new
buildings, fences, harvesting) are complete. Prototype ready for next
round of playtesting/balancing.
