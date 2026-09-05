# Phase 6 – Polishing & Optimization

## Goal

Optimize performance, refine UI, final touches.

## Prompt for Claude Code

```text
Optimize performance for many buildings (up to 200).

Tasks:
1. Analyze where the biggest costs are (render, update, tilemap).
2. Propose concrete optimizations (e.g. only render visible tiles,
   object pooling for buildings, reduced update rate).
3. Implement the top 3 optimizations.
4. Describe how I can measure FPS before/after.

Additional Tasks:
- Refine UI (better buttons, hover effects, tooltips).
- Small sound effects when placing buildings (optional).
- Adjust color palette (Western look: brown, beige, green).

Process:
1. Show analysis first (where are the costs).
2. Propose optimizations and prioritize.
3. After approval: implement.
4. Explain FPS measurement.
```

## Acceptance Criteria

- [ ] Game runs smoothly with 200+ buildings (60 FPS)
- [ ] UI looks polished (consistent colors, hover effects)
- [ ] Optional: sound effects work
- [ ] Western look is recognizable (color palette)
- [ ] No console errors

## Completion

After this phase, the prototype is playable and ready for testing.
Next steps (optional):
- More building types
- More complex supply chains
- Multiplayer / Highscore