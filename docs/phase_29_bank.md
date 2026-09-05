# Phase 29 – Bank

## Goal

Deposit money to earn passive interest — at the cost of drawing more
Outlaw attention.

## Prompt for Claude Code

```text
Add Bank building: deposit/withdraw, compounding interest, raid-risk tie-in.

Tasks:
1. Bank (2x2, cost 200, staffed, no production field): tracks its own
   `bankBalance`. Info panel shows balance plus "Deposit $50" /
   "Withdraw $50" buttons (disabled with a reason: can't afford /
   nothing to withdraw / disabled-hp).
2. Each production tick, every Bank's balance grows 0.5% (compounding,
   like HP regen's percentage-based math), independent of staffing —
   money sitting in the bank grows whether or not anyone's working
   there (it's not a production building).
3. Raid-risk tie-in (Phase 23): sum every Bank's balance. Above a
   threshold (e.g. 200 total), the next raid's faction pick is weighted
   toward Outlaws (e.g. 60% Outlaws / 20% Rustlers / 20% Coyotes
   instead of the normal even 1/3 each) AND the raid-check interval is
   shortened (e.g. halved) — a full bank draws more, and more frequent,
   Outlaw attacks. Below the threshold, raids stay at today's even/
   normal-frequency behavior.
4. Withdraw returns money from the bank balance back to the player's
   money, 1:1, no penalty.

Process:
1. Confirm deposit/withdraw increment, interest rate, and risk
   threshold/weighting before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Bank placeable, staffed or not, holds a growing balance
- [ ] Deposit/withdraw work and are gated sensibly
- [ ] Balance actually compounds over time, visible in the info panel
- [ ] A well-funded bank measurably raises Outlaw raid frequency/likelihood
- [ ] `npm run build` passes, no console errors

## Completion

Closes this round: multi-select, 3 new resource chains, Liquor/Saloon,
mounted units, and the Bank's risk/reward loop.
