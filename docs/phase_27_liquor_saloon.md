# Phase 27 – Liquor & Saloon

## Goal

Potatoes (Phase 26) become Liquor. Saloon autonomously sells it, same
pattern as Supermarket.

## Prompt for Claude Code

```text
Add Liquor building + Saloon.

Tasks:
1. New ResourceKey: liquor.
2. New building Liquor (2x2, cost 140, staffed): inputs {potatoes: 2},
   outputs {liquor: 1} — same shape as Butcher/Sewery/Wood-cutter.
3. New building Saloon (2x2, cost 200, staffed, no production field):
   each tick, sells up to 2 liquor/tick at $12 each from the global
   pool into Money — same runSupermarketSales pattern (Phase 14) but
   its own pass/tracking (don't overload Supermarket's lastSale shape,
   give Saloon its own equivalent field).
4. Building info panel: Saloon shows last-tick sale like Supermarket
   does ("Sold: X Liquor -> +$Y" / why it isn't selling).
5. Pixel-art sprites for Liquor building and Saloon (saloon = classic
   Western saloon front: swinging doors, sign, second-story balcony
   hint), same PixelSprite system.

Process:
1. Confirm sell rate/price before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Liquor building consumes potatoes, produces liquor when staffed
- [ ] Saloon auto-sells liquor for money, no clicks
- [ ] Info panel shows Saloon's sale status like Supermarket's
- [ ] `npm run build` passes, no console errors
