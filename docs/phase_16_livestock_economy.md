# Phase 16 – Livestock Economy

## Goal

Farms start with 0 animals. Player buys animals per building (capped).
Output scales with animal count. Buying requires an adjacent Fence.

## Prompt for Claude Code

```text
Add per-building animal ownership + purchasing.

Tasks:
1. Farms affected: Chicken Farm, Pig Farm, Cattle Farm, Cow Ranch.
2. Each gets an animal config: label, cost/animal, max animals,
   output/animal (tuned so a maxed-out building matches today's flat
   output — continuity, not a balance jump).
3. PlacedBuilding tracks animalCount, starts at 0. No animals = no
   output, regardless of staffing/inputs.
4. Buying requires an adjacent Fence (same adjacency check Cow Ranch
   already uses) — hard prerequisite for ALL four farms now, not just
   Cow Ranch's old half-output rule (retire that rule, replaced by this).
5. Building info panel: show animal count/max and a "Buy <Animal>
   ($X)" action, disabled with a reason (no fence / at cap / can't
   afford) when it can't be used.
6. Production tick: output = outputPerAnimal * animalCount (still
   gated by staffing/inputs as before).

Process:
1. Confirm cost/animal, max/animal, output/animal numbers before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Freshly placed farm produces nothing until animals are bought
- [ ] Buying blocked without an adjacent Fence, with a clear reason shown
- [ ] Can't exceed max animals or spend money you don't have
- [ ] Output scales linearly with animal count
- [ ] `npm run build` passes, no console errors

## Completion

Phase 17 adds static animal sprites reflecting animalCount on the map.
