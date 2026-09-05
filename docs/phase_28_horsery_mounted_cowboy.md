# Phase 28 – Horsery & Cowboy on Horse

## Goal

A second, pricier, faster combat unit. Plugs into Phase 25's
generalized selection/move-order system alongside regular Cowboys.

**Animation note**: no new frame-based walk-cycle system — this
codebase animates small units via flip + tween movement everywhere
(villagers, animals, raiders, Cowboys), not sprite-sheet frames. The
mounted unit reads as "faster/animated" through its higher move speed
plus the same technique, not new engineering. Said plainly so it's not
mistaken for an oversight.

## Prompt for Claude Code

```text
Add Horsery building + Cowboy on Horse unit.

Tasks:
1. Horsery (2x2, cost 220, staffed, no production field): trains
   Cowboy on Horse units, max 2 per Horsery, cost $90/unit.
2. Cowboy on Horse: same combat role as a Cowboy (5-tile range, same
   damage) but 3x walk speed and higher HP (40 vs Cowboy's 30) —
   reflecting the cost/rarity difference. Regens like any other unit.
3. Must plug into Phase 25's generalized unit selection/multi-select/
   move-order system as a second unit kind — selecting a box that
   contains both Cowboys and Cowboys-on-Horse should select both, and
   a move order should move all of them (each at its own speed).
4. Raid combat (Phase 23) already iterates "every unit near a raider" —
   extend it to also include Cowboy-on-Horse units, same fire logic.
5. Pixel-art sprite: cowboy-on-horse silhouette (wider than the plain
   Cowboy sprite — horse body + rider), same size class/atlas pattern.
   Horsery building sprite: stable/corral look (wood rails, hay,
   horse-head silhouette), same PixelSprite system.

Process:
1. Confirm cost/cap/speed/HP numbers before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Horsery placeable, staffed, trains up to 2 Cowboys on Horse
- [ ] Mounted units visibly move ~3x faster than regular Cowboys
- [ ] Box-select picks up both unit kinds; move order moves both
- [ ] Mounted units fire on raiders in range like regular Cowboys
- [ ] `npm run build` passes, no console errors
