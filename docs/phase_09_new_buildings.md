# Phase 9 – New Buildings (Chicken Farm, Pig Farm, Cow Ranch)

## Goal

Extend production chain variety with 3 new buildings, using pixel assets (Phase 7) and harvest mechanic (Phase 8).

## Prompt for Claude Code

```text
Add 3 new building types.

Tasks:
1. Chicken Farm: produces Eggs (new resource).
2. Pig Farm: produces raw meat variant or feeds Butcher alongside Cattle
   Farm (decide: shared "Raw Meat" pool vs separate "Pork" resource).
3. Cow Ranch: alternative/upgrade to Cattle Farm, higher cost, higher
   raw meat output, requires adjacent Fence (see Phase 10) to function
   at full output.
4. Add sprites (pixel style), building-bar entries, costs, tooltips.
5. Wire into harvest system from Phase 8.
6. Update resource HUD for any new resource types.

Process:
1. Propose resource model (new resources vs shared pools) and costs/balance.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] 3 new buildings placeable, costed, produce correctly
- [ ] New resources (if any) shown in HUD
- [ ] Harvest interaction works for all 3
- [ ] Balance: no building trivially dominates others
- [ ] `npm run build` passes, no console errors

## Completion

Enables Phase 10 fences (cow ranch dependency) and richer late-game optimization.
