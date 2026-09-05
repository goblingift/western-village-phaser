# Phase 13 – Warehouse & Autonomous Logistics

## Goal

Replace Phase 8's click-to-collect with fully autonomous production.
Output flows straight to storage, capped by warehouse capacity.
**This supersedes Phase 8** — remove the buffer/click-collect
mechanic and its `$` ready indicator.

## Prompt for Claude Code

```text
Make production fully autonomous; add Warehouse building.

Tasks:
1. Remove click-to-collect: building outputs go straight into the
   global resource pool each tick (as before Phase 8), no per-building
   buffer, no click handler, no "$" ready indicator, no
   collectBuilding().
2. Add a global per-resource storage cap representing total warehouse
   capacity: BASE_STORAGE_CAP (no warehouse, small, e.g. 50) +
   WAREHOUSE_STORAGE_BONUS per placed Warehouse (e.g. +150 each).
   Production that would exceed the cap is wasted (not added,
   logged/ignored) — this gives Warehouse real functional purpose.
3. New BuildingType Warehouse: 2x2, cost 150, no production/output of
   its own, requires workersRequired (Phase 12) to operate — if
   understaffed, it contributes 0 storage bonus.
4. HUD: show current storage usage vs cap per resource (or a compact
   summary), so players see when they're wasting production.
5. Pixel-art sprite for Warehouse in BootScene.ts (large barn/storage
   building, follow existing PixelSprite pattern).

Process:
1. Confirm storage cap numbers before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] No click-to-collect anywhere; production is fully passive
- [ ] Resources stop accumulating once storage cap is hit
- [ ] Placing a staffed Warehouse raises the cap immediately
- [ ] HUD reflects storage usage vs cap
- [ ] `npm run build` passes, no console errors

## Completion

Enables Phase 14 (Supermarket) to draw finished goods from this
now-automatic pool.
