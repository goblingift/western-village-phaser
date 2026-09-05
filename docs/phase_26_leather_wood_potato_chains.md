# Phase 26 – Leather/Clothes, Wood, and Potato Chains

## Goal

Three new independent production chains, all reusing the existing
farm/processor/staffing patterns — no new mechanics.

## Prompt for Claude Code

```text
Add 3 production chains + 4 new resources + 4 new buildings.

Tasks:
1. Leather/Clothes: Cattle Farm and Cow Ranch's existing per-animal
   output gains a second output key, `leather` (small amount alongside
   their existing rawMeat/animal — e.g. CattleFarm cow: +0.05
   leather/animal/tick, Cow Ranch cow: +0.1 leather/animal/tick). New
   building Sewery (2x2, cost 130, staffed): inputs {leather: 1},
   outputs {clothes: 1} — same shape as Butcher.
2. Wood: new building Forestry (2x2, cost 60, staffed, flat
   production like Well — no animal-purchase mechanic, this isn't
   livestock): outputs {logs: 1.2}/tick. New building Wood-cutter
   (2x2, cost 100, staffed): inputs {logs: 1}, outputs {wood: 1} —
   same shape as Butcher.
3. Potatoes: new building Potato Field (2x2, cost 90, staffed, flat
   production like Well): outputs {potatoes: 1.2}/tick.
4. New ResourceKeys: leather, clothes, logs, wood, potatoes. Update
   the resource HUD, resource pool, resetGame, storage cap (Phase 13 —
   these all flow through the existing per-resource storage cap).
5. Supermarket (Phase 14) gains 3 more sellable goods: potatoes ($2
   each), wood ($3 each), clothes ($15 each — finished luxury good),
   same auto-sell-up-to-rate-per-tick mechanic as its existing
   meat/eggs lines.
6. Pixel-art sprites for all 4 new buildings (Sewery, Forestry,
   Wood-cutter, Potato Field), Western-themed, same PixelSprite system.

Process:
1. Confirm the numbers above before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] All 4 new buildings placeable, staffed, produce correctly
- [ ] Cattle Farm/Cow Ranch produce leather alongside raw meat once animals are bought
- [ ] Sewery/Wood-cutter correctly consume their input to produce their output
- [ ] Supermarket auto-sells potatoes/wood/clothes like it already does meat/eggs
- [ ] `npm run build` passes, no console errors

## Completion

Phase 27 adds the Liquor building (consumes potatoes) and Saloon.
