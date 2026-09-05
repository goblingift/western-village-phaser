# Phase 5 – Game Goal & Score

## Goal

Simple goal: "Produce X meat in Y minutes".

## Prompt for Claude Code

```text
Add a game goal and score system:

Goal:
- Produce as much meat as possible in 5 minutes.
- UI: timer top-right, current meat score.

End:
- After 5 minutes: overlay with:
  - produced meat
  - built buildings (count per type)
  - button "Play Again" (reset).

Implementation:
1. Timer logic.
2. Score tracking.
3. End overlay (Phaser or HTML).
4. Reset function (all buildings, resources, score reset).

Process:
1. Show plan first.
2. After approval: implement.
3. Provide test instructions (check timer, score, reset).
```

## Acceptance Criteria

- [ ] Timer runs for 5 minutes
- [ ] Meat score is displayed in real-time
- [ ] After 5 minutes, end overlay with statistics appears
- [ ] "Play Again" correctly resets everything
- [ ] No console errors

## Next Phase

See `phase_06_polishing_optimization.md`