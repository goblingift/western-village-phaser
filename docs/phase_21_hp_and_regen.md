# Phase 21 – HP & Regeneration

## Goal

Every building and unit has HP. Slowly regenerates over time. No
combat yet — this is the foundation phase 23 (raids) builds on.

## Prompt for Claude Code

```text
Add HP to buildings; passive regen.

Tasks:
1. BuildingDefinition gets maxHp (tiered roughly by cost/footprint,
   e.g. Road/Fence ~15-20, House/Well/ChickenFarm ~40-50, 2x2 farms
   ~80-100, Warehouse/Supermarket ~90-100).
2. PlacedBuilding gets hp: number, starts at maxHp on placement.
3. Each production tick, every building regens a small % of maxHp
   (e.g. 2%), capped at maxHp. Regen always runs, independent of
   staffing/production gates.
4. HP 0 = building "disabled": no production, no worker slot, doesn't
   count toward storage cap/population, until regen brings it back
   above 0. Buildings are NEVER destroyed/removed this phase (no
   demolish system exists yet — deliberately out of scope).
5. Building info panel: show HP/maxHP, with a visual cue when
   disabled (0 HP).
6. Small HP bar over any building currently below max HP (hide it at
   full HP so healthy buildings don't get visual clutter).

Process:
1. Confirm maxHp tier numbers before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Every building has hp/maxHp, regenerates automatically over time
- [ ] 0 HP disables the building without removing it
- [ ] HP bar only shows on damaged buildings
- [ ] `npm run build` passes, no console errors

## Completion

Phase 22 adds Barracks/Cowboy units (also HP-bearing). Phase 23 adds
the raid events that actually damage buildings/units.
