# Phase 4 – Roads & Simple Logistics Rules

## Goal

Roads connect buildings, optional small production bonus.

## Prompt for Claude Code

```text
Extend the system with roads:

Rules:
- Roads cost money, size 1x1.
- A building is "connected" if it has at least one road in orthogonal (4-neighbor) direction,
  which in turn is connected to another building.
- Connected buildings get +10% production speed.

Tasks:
1. Data structure for roads and connections.
2. Algorithm that checks for each building if it is connected.
3. Extend production tick with bonus.
4. Visual feedback (e.g. green border for connected buildings).

Proceed step by step:
1. Show plan first (data structures, algorithm, affected files).
2. After approval: implement.
3. Provide test instructions (how to check connection visually/logically).
```

## Acceptance Criteria

- [ ] Roads can be placed
- [ ] Algorithm correctly detects connected buildings
- [ ] Connected buildings produce faster (+10%)
- [ ] Visual feedback (green border) works
- [ ] Performance remains stable with many roads

## Next Phase

See `phase_05_game_goal_score.md`