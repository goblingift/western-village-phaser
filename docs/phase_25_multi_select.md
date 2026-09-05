# Phase 25 – Multi-Select (Drag Rectangle)

## Goal

Select multiple units at once by dragging a selection rectangle.
Right-click still issues a move order, now to every selected unit.

**Control scheme change**: left-drag on empty ground now draws a
selection box (was: camera pan). Camera panning moves to **right-drag**
instead. Right-*click* (no drag) still issues a move order / cancels
placement, unchanged. Minimap click/drag-to-navigate is untouched.

## Prompt for Claude Code

```text
Add drag-rectangle multi-select for Cowboy units; move camera-pan to right-drag.

Tasks:
1. Left-button drag (not placing a building, not on the minimap) draws
   a semi-transparent selection rectangle (Graphics) following the
   pointer from drag-start to current position.
2. On release, select every living Cowboy unit whose position falls
   inside the rectangle. A short drag (below the existing
   CLICK_MOVE_THRESHOLD) is a plain click — keep today's single-select
   behavior for that case.
3. Camera drag-to-pan moves from left-drag to right-drag (explicit
   pointer.rightButtonDown() check, matching how the rest of the file
   already distinguishes buttons) — right-CLICK (no significant drag)
   must still work as move-order/cancel-placement, so distinguish
   right-drag-to-pan from right-click-to-command using the same
   click-vs-drag threshold technique already used elsewhere.
4. Right-click with 1+ units selected issues a move order to ALL of
   them (each walks independently to the target, small random per-unit
   offset so they don't stack exactly on one point).
5. Generalize the unit-tracking type/selection state from "one
   selected Cowboy" to "a list of selected units" — name it generically
   (e.g. `CombatUnit`/`selectedUnits`) since Phase 28 will add a second
   unit type (Cowboy on Horse) that must plug into the same
   selection/move system.
6. Selection ring is drawn per selected unit now, not just one.

Process:
1. Confirm the control-scheme change (right-drag pans, left-drag
   selects) before coding — this changes existing camera behavior.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Left-drag draws a box and selects every Cowboy inside it
- [ ] Right-drag still pans the camera; right-click still commands units
- [ ] Right-click with multiple selected moves all of them
- [ ] Single click-select (no drag) still works as before
- [ ] `npm run build` passes, no console errors

## Completion

Phase 28's Cowboy-on-Horse plugs into this same generalized selection system.
