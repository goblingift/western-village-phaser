# Phase 24 – Cowboy Unit Control

## Goal

Cowboys stop being fixed garrison decorations. Left-click selects one,
right-click on the map orders it to walk there (standard RTS control).
A cowboy defends wherever it currently stands, not just near its Barracks.

## Prompt for Claude Code

```text
Add click-to-select + right-click-to-move for Cowboy units.

Tasks:
1. Cowboys become independently-positioned units (their own live x/y,
   not derived from a fixed Barracks slot formula) — still spawned at
   a slot position near their Barracks, but movable afterward.
2. Left-click on a Cowboy sprite selects it (small ring/highlight).
   Single selection is enough — no drag-box multi-select this phase.
   Clicking empty ground/a building deselects.
3. Right-click on the map, while a Cowboy is selected and no building
   placement is active, issues a move order: the Cowboy walks there
   (same point-to-point tween technique as raiders/villagers),
   clamped to map bounds. Must not fire while placing a building
   (existing right-click = cancel-placement) or when clicking the
   minimap (existing minimap guard).
4. Raid combat (Phase 23's resolveCowboyFire) must read each Cowboy's
   current live position, not a slot formula — a repositioned Cowboy
   should defend wherever it now stands.
5. Cleanup on game-reset: clear selection, kill move tweens, destroy
   unit tracking along with existing Cowboy sprite cleanup.

Process:
1. Confirm the selection-hit-test approach and single-vs-multi-select
   scope before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Clicking a Cowboy selects it (visible feedback)
- [ ] Right-click moves the selected Cowboy there, doesn't break building placement/minimap
- [ ] A moved Cowboy still fires on raiders in range from its new position
- [ ] `npm run build` passes, no console errors

## Completion

Cowboys are now player-directed defenders, not static garrison props.
