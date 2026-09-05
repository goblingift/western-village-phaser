# Phase 3 – Resources & Production Logic

## Goal

Simple supply chain: Cattle Farm → Raw Meat, Well → Water, Butcher processes.

## Prompt for Claude Code

```text
Add a resource and production system:

Resources:
- Money (start: e.g. 500)
- Raw Meat
- Meat
- Water

Building Logic:
- Cattle Farm: produces 1 Raw Meat every X seconds.
- Well: produces 1 Water every X seconds.
- Butcher:
  - Consumes per cycle: 1 Raw Meat + 1 Water
  - Produces: 1 Meat
  - Only if both resources are available.

UI:
- Top-left: display current resources.
- On click on a building: small panel with:
  - Type
  - Current production (on/off)
  - Optional: input/output.

Implementation:
1. Global resource structure (store/service).
2. Production timer (e.g. every 2 seconds a tick).
3. Logic for each building in MainScene or separate system.
4. UI updates after each tick.

Test:
- Describe how I can manually check production (e.g. console logs).

Process:
1. Show plan first.
2. After approval: implement.
3. Provide test instructions.
```

## Acceptance Criteria

- [ ] Resources (money, raw meat, meat, water) are displayed top-left
- [ ] Cattle Farm produces raw meat regularly
- [ ] Well produces water regularly
- [ ] Butcher only produces meat when raw meat + water are available
- [ ] UI shows current resource values in real-time

## Next Phase

See `phase_04_roads_logistics.md`