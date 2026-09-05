# Phase 23 – Raid Events & Combat

## Goal

Random raid events: 2-5 units of ONE randomly-picked threat faction
enter from the map edge, walk toward the town, and attack buildings.
Cowboys (Phase 22) auto-fire at any raider within their 5-tile range.

**Factions** (fictional, non-ethnic — see conversation):
- **Outlaws**: bandit gang, targets any building. HP 30, damage 6/tick, normal speed.
- **Rustlers**: cattle thieves, prefers farm buildings (anything with
  an `animal` config — Chicken Farm/Pig Farm/Cattle Farm/Cow Ranch),
  falls back to any building if none exist. HP 25, damage 5/tick, normal speed.
- **Coyotes**: wildlife, prefers farm buildings too (after livestock),
  weaker but faster. HP 15, damage 3/tick, faster speed than the other two.

One faction is picked at random per wave — not all three at once.

## Prompt for Claude Code

```text
Add raid events + combat resolution across 3 threat factions.

Tasks:
1. Random raid trigger: every so often (random interval, e.g. 45-90s),
   with no raid currently active, pick one faction (Outlaws/Rustlers/
   Coyotes) at random and spawn 2-5 of its units at a random point
   along the map edge.
2. Raiders walk toward a target building (simple point-to-point tween
   like Phase 20's villagers — no pathfinding). Rustlers/Coyotes prefer
   the nearest farm-type building (has `animal` config), falling back
   to nearest building of any type if none exist; Outlaws just target
   nearest building of any type. On reaching a building, deal damage
   to it periodically until it dies or the raider is killed.
3. Every Cowboy (Phase 22) auto-targets the nearest raider within 5
   tiles each combat tick and deals damage (simple projectile line/
   dot visual optional but nice — keep cheap).
4. Raider HP depletes from Cowboy fire; at 0 HP, raider is removed.
   Raid ends when all raiders for that wave are dead (or a timeout).
5. Building HP depletes from raider attacks, floored at 0 (disabled,
   per Phase 21 — never destroyed/removed).
6. HUD: brief notice naming the faction when a raid starts (e.g.
   "Outlaws incoming!" / "Rustlers incoming!" / "Coyotes incoming!"),
   cleared when the wave ends.

Process:
1. Confirm raid frequency/wave size/per-faction numbers before coding.
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Raids trigger periodically, one faction per wave, visible (units + notice)
- [ ] Rustlers/Coyotes visibly prioritize farm buildings when any exist
- [ ] Cowboys within range damage and eventually kill raiders
- [ ] Raiders damage buildings they reach; buildings disable at 0 HP, then regen
- [ ] No Cowboys/no Barracks = raids still happen, town is undefended
- [ ] `npm run build` passes, no console errors

## Completion

Closes the combat round: HP everywhere, a defensive unit, and a
threat that makes the defense matter.
