# Phase 12 – Population & Workforce

## Goal

Houses hold people. People work in buildings. No workforce, no production.

## Prompt for Claude Code

```text
Add population/workforce system.

Tasks:
1. Each House provides 2 population capacity (POPULATION_PER_HOUSE).
2. Global workforce pool: totalPopulation = sum of House capacity,
   employedPopulation, idlePopulation.
3. Each production building (Cattle Farm, Butcher, Well, Chicken Farm,
   Pig Farm, Cow Ranch) needs N assigned workers to produce at all
   (workersRequired on BuildingDefinition — 1 for 1x1, 2 for 2x2).
4. Auto-assignment each tick: distribute available population across
   buildings needing workers (deterministic order, e.g. placement
   order) up to each building's requirement. Fully staffed = produces
   normally. Understaffed = produces nothing this tick.
5. HUD: show "Population: employed/total".
6. Building info panel: show "Workers: assigned/required" for
   production buildings.

Process:
1. Confirm workersRequired values and auto-assignment order before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] No houses placed -> no production buildings can staff -> nothing produces
- [ ] Placing houses increases population, unlocks staffing
- [ ] HUD shows employed/total population, updates live
- [ ] Info panel shows worker assignment per building
- [ ] `npm run build` passes, no console errors

## Completion

Workforce gate applies uniformly before Phase 13 (Warehouse) and Phase
14 (Supermarket) buildings are added, so those are staffed the same way.
