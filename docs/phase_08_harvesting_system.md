# Phase 8 – Harvesting System (Click to Collect)

## Goal

Add manual collection: player clicks ready building to collect its output, alongside/instead of pure auto-tick production. Core loop change other new buildings (Phase 9) will use.

## Prompt for Claude Code

```text
Add click-to-collect harvesting.

Tasks:
1. Design harvest state per building: ready/not-ready, visual indicator
   (e.g. bounce icon or glow) when output is available.
2. Decide production model: keep 2s auto-tick accumulating into a
   collectible buffer, OR require click to finalize each cycle. Propose
   both, recommend one.
3. Click on ready building -> resource added to pool, building resets
   to not-ready, small feedback (particle/sound/number popup).
4. Update building info panel to show harvest state.

Process:
1. Propose harvest model + UX (indicator, feedback) before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Ready buildings show clear visual indicator
- [ ] Click collects resources, updates HUD immediately
- [ ] Not-ready buildings ignore clicks (no exploit/double-collect)
- [ ] Works at 200 buildings without perf regression
- [ ] `npm run build` passes, no console errors

## Completion

Harvest mechanic becomes basis for new production buildings in Phase 9.
