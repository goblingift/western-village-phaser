# Phase 14 – Supermarket & Autonomous Sales

## Goal

Meat and Eggs automatically sell for Money each tick. Closes the loop:
produce -> store (Phase 13) -> sell -> Money, zero clicks.

## Prompt for Claude Code

```text
Add Supermarket building; automatic selling.

Tasks:
1. New BuildingType Supermarket: 2x2, cost 200, workersRequired 2
   (Phase 12 staffing applies).
2. Each tick, every staffed+active Supermarket sells up to a per-tick
   rate from the global pool: e.g. 2 Meat/tick at $5 each, 2 Eggs/tick
   at $3 each (tune numbers, keep Butcher's meat chain worth more than
   raw eggs). Selling consumes the resource and adds Money.
3. Multiple Supermarkets multiply throughput (each sells its own
   allotment, still capped by what's actually in the pool).
4. HUD/info panel: show Supermarket's last-tick sales (e.g. "Sold: 2
   Meat, 1 Egg -> +$13") so the automatic loop is visible/legible.
5. Pixel-art sprite for Supermarket in BootScene.ts (general-store
   Western storefront, follow existing PixelSprite pattern).

Process:
1. Confirm sell rates/prices before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Supermarket automatically converts Meat/Eggs to Money, no clicks
- [ ] Understaffed/unstaffed Supermarket sells nothing
- [ ] Info panel shows last sale for a selected Supermarket
- [ ] Money increases visibly over time with a working production+sale chain
- [ ] `npm run build` passes, no console errors

## Completion

Full autonomous loop complete: population staffs buildings ->
buildings produce into warehouse-capped storage -> supermarket sells
automatically. Phase 15 gives everything a proper Western look.
