# Phase 22 – Barracks & Cowboy Units

## Goal

Barracks building trains Cowboy units (garrisoned defenders, 5-tile
shooting range). Economy/placement only this phase — actual combat
against raiders is Phase 23.

## Prompt for Claude Code

```text
Add Barracks building + Cowboy garrisoned units.

Tasks:
1. Barracks: 2x2, cost ~180, requiresWorkers (staffed like Warehouse/
   Supermarket, no production output of its own).
2. Cowboy unit: bought like Phase 16's animals (reuse that buy-gate
   pattern: cost per unit, max per Barracks, e.g. $40/unit, max 3) —
   NOT gated on a Fence (that's an animal-specific rule), just cost +
   cap + staffing.
3. Cowboys are garrisoned (static position near the Barracks, small
   pixel sprite, same slot-layout technique as Phase 17 animals) —
   they do not roam. Range = 5 tiles (store as a constant, this is
   what Phase 23's combat will read).
4. Cowboys have HP too (Phase 21's system) — same regen rules.
5. Building info panel: show Cowboys count/max and a "Train Cowboy
   ($X)" button, same disabled+reason pattern as the animal buy button.

Process:
1. Confirm cost/max/range numbers before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Barracks placeable, staffed, trains Cowboys up to cap
- [ ] Cowboy sprites render garrisoned near the Barracks
- [ ] Cowboys have HP, regen like any other unit
- [ ] `npm run build` passes, no console errors

## Completion

Phase 23 makes Cowboys actually shoot at raiders within range.
