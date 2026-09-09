import Phaser from 'phaser';
import {
  ELITE_RAIDER_DAMAGE_MULTIPLIER,
  ELITE_RAIDER_FRACTION,
  ELITE_RAIDER_HP_MULTIPLIER,
  ELITE_RAIDER_MIN_TIER,
  ELITE_RAIDER_TINT,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  RAIDER_CAMP_ATTACK_HIT_RADIUS_PX,
  RAIDER_CAMP_LOOT_MONEY,
  RAIDER_CAMP_LOOT_TOOLS,
  RAIDER_CAMP_MAX_COUNT,
  RAIDER_CAMP_MAX_HP,
  RAIDER_CAMP_MIN_COUNT,
  RAIDER_CAMP_SPAWN_DAY,
  RAID_ABSOLUTE_MAX_UNITS,
  RAID_HP_PER_ESCALATION_TIER,
  RAID_MAX_HP_MULTIPLIER,
  RAID_MAX_INTERVAL_MS,
  RAID_MAX_INTERVAL_SQUEEZE,
  RAID_EARLIEST_ELAPSED_MS,
  RAID_MAX_UNITS_ESCALATED,
  RAID_MIN_INTERVAL_FLOOR_MS,
  RAID_MIN_INTERVAL_MS,
  RAID_MIN_UNITS,
  RAID_UNITS_PER_ESCALATION_TIER,
  RAID_WARNING_LEAD_MS,
  RAID_WAVE_TIMEOUT_MS,
  RAIDER_UNIT_ATTACK_RANGE_TILES,
  RAIDER_WALL_DETOUR_OFFSETS_TILES,
  TILE_SIZE,
  VIEWPORT_WIDTH,
} from '../../config/constants';
import {
  BuildingType,
  PlacedBuilding,
  RAIDERS_ATLAS_KEY,
  RAIDER_CAMPS_ATLAS_KEY,
  RAIDER_CAMP_SPRITE_SIZE,
  RAIDER_DEFINITIONS,
  RAIDER_SPRITE_SIZE,
  RaiderDefinition,
  RaiderFaction,
  BUILDING_DEFINITIONS,
  blocksRaiderMovement,
  raiderCampTextureKey,
  raiderTextureKey,
} from '../../config/buildingConfig';
import { playRaidStinger, playWorldSound } from '../../audio/sound';
import { gameEvents } from '../../state/gameEvents';
import { addNotification } from '../../state/notifications';
import {
  RaiderCamp,
  damageRaiderCamp,
  getRaiderCamps,
  removeRaiderCamp,
  spawnRaiderCamp,
} from '../../state/raiderCamps';
import {
  DayPhaseChange,
  damageUnit,
  getBuildingAtTile,
  getBuildingById,
  getDayPhase,
  getElapsedSeconds,
  getEscalationTier,
  getPhaseAtElapsed,
  getPlacedBuildings,
  getThreatLevel,
  grantRaiderCampLoot,
} from '../../state/gameState';
import type { MainScene } from '../MainScene';

/**
 * Phase 31: Phase 29's bank-balance-only raid hook is generalized into
 * gameState.getThreatLevel() (elapsed time + net worth, which already
 * includes banked cash). Above this threat level raids lean Outlaw, exactly
 * as a full bank used to.
 */
const OUTLAW_BIAS_THREAT = 0.35;

/**
 * Phase 23 raiders share the villager/animal/cowboy small-unit depth band -
 * just above buildings and accents, below the HP bars that must always read
 * on top of everything they're reporting on.
 */
const RAIDER_SPRITE_DEPTH = 12;

/**
 * Phase 57: Raider Camps are static map structures, not roaming units, so
 * they render at the same depth band as buildings (10) rather than the
 * small-unit band (12) - the same z-order convention a real building would
 * use, just without ever entering buildingVisuals/gameState's PlacedBuilding
 * list.
 */
const RAIDER_CAMP_SPRITE_DEPTH = 10;

/** Phase 40: same hit-test radius as unit selection, used to tell "right-clicked a raider" (attack order) from "right-clicked empty ground" (plain move order). */
const RAIDER_ATTACK_HIT_RADIUS_PX = 10;

/**
 * Raiders are NOT tied to a BuildingVisual (unlike animals/cowboys, which are
 * always owned by exactly one building) - they're independent hostile units
 * that roam in from the map edge, so they get their own small scene-level
 * tracking array, mirroring Phase 20's villagers but with more per-unit state.
 * `targetBuildingId` is looked up through gameState.getBuildingById rather
 * than holding a PlacedBuilding reference directly, since a building's own hp
 * (the thing raiders actually damage) lives in gameState and must stay the
 * single source of truth.
 */
export interface Raider {
  /** Phase 40: stable identity so a unit's attack order (CombatUnit.attackTarget) can survive this raider's hp changing/moving across ticks without holding a live object reference across the array's own churn. */
  id: string;
  image: Phaser.GameObjects.Image;
  faction: RaiderFaction;
  hp: number;
  /** Phase 40: RAIDER_DEFINITIONS.maxHp scaled by this wave's threat hpMultiplier at spawn time (see startRaid) - the HP bar needs the *scaled* cap, not the base table value, to read correctly on an escalated wave. */
  maxHp: number;
  /** Phase 80: per-instance damage multiplier (1 for a normal raider, ELITE_RAIDER_DAMAGE_MULTIPLIER for an elite) applied on top of RAIDER_DEFINITIONS[faction].damage at the point of attack - never mutates the shared definitions table. */
  damageMultiplier: number;
  /** Phase 80: true for a raider rolled elite at spawn (escalation tier >= ELITE_RAIDER_MIN_TIER) - visually a setTint(ELITE_RAIDER_TINT) on the same base sprite, no new art. */
  isElite: boolean;
  targetBuildingId: string | null;
  /** True once this raider's walk-to-target tween has completed; only then does it attack instead of moving. */
  arrived: boolean;
  /**
   * Phase 61: true while this raider is mid-detour (walking a lateral
   * waypoint leg found by findWallDetourPoint, not yet re-resolved onto its
   * real attack target). updateRaiderTargeting early-returns while this is
   * set so the retarget-every-combat-tick check doesn't interrupt the
   * detour's own tween; the detour's onComplete clears it and re-resolves.
   */
  detouring: boolean;
}

/**
 * Phase 85: MainScene Decomposition Part 1 - Raids & Combat.
 *
 * A pure code-move out of MainScene.ts: raid scheduling/lifecycle, raider
 * spawning, targeting/wall-detour pathing, raid-only combat resolution
 * (resolveRaiderAttacks/removeDeadRaiders/endRaidWave), and Raider Camps
 * (Phase 57) now live here instead of as ~35 private MainScene methods.
 *
 * What deliberately did NOT move (documented in the phase report, not
 * re-litigated here): runRaidCombatTick itself and the shooter-resolution
 * functions (resolveCowboyFire/applyUnitDamage/applyDynamiterSplash/
 * resolveUnitFireTarget/resolveWatchtowerFire/findNearestRaider) are fused
 * with Hostile Wildlife (Phase 71) combat in the same functions - splitting
 * them would be a genuine redesign, not a mechanical move, so they stay on
 * MainScene and call back into this system where they need raider state.
 *
 * Constructed once in MainScene.create() as `new RaidSystem(this)` - a plain
 * class, not a Phaser Scene/Plugin, holding a reference to the owning scene
 * for every Phaser facility (this.scene.add/tweens/time) and MainScene helper
 * (tileCenter, spawnDustBurstAt, redrawMinimap, spawnCowboyShotVisual, ...)
 * this code still needs.
 */
export class RaidSystem {
  private scene: MainScene;

  raiders: Raider[] = [];
  /** Phase 40: monotonically increasing so every Raider.id is unique for the life of the scene, even across waves/resets - a stray stale AttackTargetRef can then never accidentally match a later, unrelated raider. */
  private raiderIdCounter = 0;

  /** Phase 57: Raider Camps' sprites, keyed by RaiderCamp.id - the camps themselves (position/hp/faction) live in state/raiderCamps.ts, mirroring how building.hp lives in gameState while buildingVisuals only holds the Image. */
  private campVisuals = new Map<string, Phaser.GameObjects.Image>();
  /** Phase 57: true once this run has rolled its initial 1-3 Raider Camps (on the first dawn at/after RAIDER_CAMP_SPAWN_DAY, or restored from a loaded save) - guards spawnInitialRaiderCamps against firing more than once per run. */
  private initialCampsSpawned = false;

  raidActive = false;
  raidNoticeText!: Phaser.GameObjects.Text;
  private raidCheckTimer: Phaser.Time.TimerEvent | null = null;
  private raidWaveTimer: Phaser.Time.TimerEvent | null = null;
  private raidWarningTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  // ---------------------------------------------------------------------
  // Setup / scheduling
  // ---------------------------------------------------------------------

  setupRaidSystem(): void {
    this.raidNoticeText = this.scene.add.text(VIEWPORT_WIDTH / 2, 40, '', {
      fontSize: '20px',
      color: '#ffeb3b',
      backgroundColor: '#2b1d12cc',
      padding: { x: 10, y: 6 },
    });
    this.raidNoticeText.setOrigin(0.5, 0);
    this.raidNoticeText.setScrollFactor(0);
    this.raidNoticeText.setDepth(1000);
    this.raidNoticeText.setVisible(false);
    this.scene.registerUiObject(this.raidNoticeText);

    this.scheduleNextRaidCheck();
  }

  /**
   * Rechecks on a freshly-randomized 45-90s delay every time (rather than
   * only after a raid ends) so raid frequency stays independent of how long
   * any given wave lasts; the "only trigger if none active" rule is enforced
   * inside by simply skipping the spawn when one already is.
   */
  /**
   * Phase 31: the interval is squeezed continuously by threat level (elapsed
   * time + net worth) instead of Phase 29's single bank-balance step. At
   * threat 0 this is the original 45-90s roll; at threat 1 both bounds are
   * halved (RAID_MAX_INTERVAL_SQUEEZE), which is exactly what a full bank
   * used to do on its own - so the old behaviour is a point on the new curve
   * rather than a special case.
   *
   * A countdown warning is scheduled RAID_WARNING_LEAD_MS before the wave so
   * the player gets a chance to reposition defenders rather than discovering
   * the raid by finding a crater.
   */
  /**
   * Phase 34 adds the grace period. Raids previously could - and routinely
   * did - land 41-83 seconds into a run, because getThreatLevel already reads
   * ~0.15 from the starting purse alone at t=0 and nothing else gated the
   * spawn. That is well before a player can afford a Barracks and a cowboy to
   * put in it, so the first raid was decided by the map, not by play.
   *
   * Two combined gates now apply, both checked at fire time (not just at
   * schedule time, since the timer's delay can span a phase boundary):
   *  - hard elapsed-time floor of RAID_EARLIEST_ELAPSED_MS,
   *  - night only.
   * A check that fires while ineligible simply reschedules; it does not
   * "bank" a raid to fire the instant the gate opens, which would just move
   * the ambush to a predictable moment.
   */
  scheduleNextRaidCheck(): void {
    const threat = getThreatLevel();
    const squeeze = 1 - RAID_MAX_INTERVAL_SQUEEZE * threat;
    // getThreatLevel() is clamped 0..1 (untouched by Phase 80), so squeeze
    // itself can never go below 1 - RAID_MAX_INTERVAL_SQUEEZE (0.5 today) and
    // this Phaser.Math.Between call alone could never spam-fire. The explicit
    // RAID_MIN_INTERVAL_FLOOR_MS clamp below is a second, independent
    // guarantee against the escalation tier ever being wired into this
    // formula in the future without someone re-deriving this safety proof.
    const rawDelay = Phaser.Math.Between(RAID_MIN_INTERVAL_MS * squeeze, RAID_MAX_INTERVAL_MS * squeeze);
    const delay = Math.max(RAID_MIN_INTERVAL_FLOOR_MS, rawDelay);

    // Only warn about a raid that will actually be allowed to happen. The
    // phase at fire time is predicted from elapsed seconds (a pure derivation
    // in gameState) rather than assumed to equal the current phase.
    if (this.willRaidBeEligibleIn(delay)) {
      this.scheduleRaidWarning(delay);
    }

    this.raidCheckTimer = this.scene.time.delayedCall(delay, () => {
      if (!this.raidActive && this.canRaidSpawnNow()) {
        this.startRaid();
      }
      this.scheduleNextRaidCheck();
    });
  }

  private canRaidSpawnNow(): boolean {
    return getElapsedSeconds() * 1000 >= RAID_EARLIEST_ELAPSED_MS && getDayPhase() === 'night';
  }

  private willRaidBeEligibleIn(delayMs: number): boolean {
    // No timeScale conversion needed: this timer and the 1s clock that drives
    // getElapsedSeconds both run on this.time, so they are scaled identically
    // and `delayMs` is already denominated in game time.
    const elapsedAtFire = getElapsedSeconds() + delayMs / 1000;
    return (
      elapsedAtFire * 1000 >= RAID_EARLIEST_ELAPSED_MS &&
      getPhaseAtElapsed(Math.floor(elapsedAtFire)) === 'night'
    );
  }

  /**
   * Ticks a "Raid in Ns" notice down over the final RAID_WARNING_LEAD_MS.
   * Runs on this.time (not setInterval) so it obeys the pause/speed control
   * along with everything else, and is suppressed while a wave is already on
   * screen - the active-raid notice is the more urgent message.
   */
  private scheduleRaidWarning(raidDelayMs: number): void {
    this.raidWarningTimer?.remove();
    this.raidWarningTimer = null;

    const lead = Math.min(RAID_WARNING_LEAD_MS, raidDelayMs);
    const warningDelay = raidDelayMs - lead;

    this.scene.time.delayedCall(warningDelay, () => {
      if (this.raidActive) {
        return;
      }
      let remaining = Math.ceil(lead / 1000);
      this.raidNoticeText.setText(`Raid in ${remaining}s - ready your cowboys!`);
      this.raidNoticeText.setVisible(true);

      this.raidWarningTimer = this.scene.time.addEvent({
        delay: 1000,
        repeat: remaining - 1,
        callback: () => {
          remaining -= 1;
          if (this.raidActive || remaining <= 0) {
            return;
          }
          this.raidNoticeText.setText(`Raid in ${remaining}s - ready your cowboys!`);
        },
      });
    });
  }

  // ---------------------------------------------------------------------
  // Wave lifecycle
  // ---------------------------------------------------------------------

  /**
   * Below OUTLAW_BIAS_THREAT: the original even pick across
   * Object.values(RaiderFaction). Above it a wealthy/late-game town draws
   * outsized Outlaw attention (60/20/20), generalizing Phase 29's
   * bank-balance trigger to overall net worth.
   */
  private pickRaidFaction(): RaiderFaction {
    const factions = Object.values(RaiderFaction);
    if (getThreatLevel() < OUTLAW_BIAS_THREAT) {
      return factions[Phaser.Math.Between(0, factions.length - 1)];
    }
    const roll = Math.random();
    if (roll < 0.6) {
      return RaiderFaction.Outlaws;
    }
    return roll < 0.8 ? RaiderFaction.Rustlers : RaiderFaction.Coyotes;
  }

  /**
   * Phase 31: wave size and raider toughness both scale with threat. The HP
   * multiplier is carried on each Raider rather than mutating
   * RAIDER_DEFINITIONS, which must stay the immutable base stat table.
   *
   * Phase 57: piggybacks Raider Camps onto this same wave timer rather than
   * forking a second one per camp (per the phase brief) - if any camp exists,
   * this wave sources its spawn point and faction from one random live camp
   * instead of pickRaidSpawnPoint()'s random edge point/pickRaidFaction()'s
   * random faction; with no camps on the map yet (or all destroyed), a raid
   * still spawns exactly as it always did, out of nowhere at a random edge.
   *
   * Phase 80: getThreatLevel()'s 0..1 blend (and therefore maxUnits/
   * hpMultiplier's base formulas above) is completely unchanged. Once
   * threat has saturated, getEscalationTier() adds a further per-tier bonus
   * on top of both: wave size gets +RAID_UNITS_PER_ESCALATION_TIER per tier,
   * hard-capped at RAID_ABSOLUTE_MAX_UNITS so the scene can never be flooded
   * past what's renderable; HP gets +RAID_HP_PER_ESCALATION_TIER per tier
   * with NO cap - this is the deliberate "true endless" difficulty lever, a
   * sufficiently long run should keep getting harder forever.
   */
  private startRaid(): void {
    const camps = getRaiderCamps();
    const sourceCamp = camps.length > 0 ? camps[Phaser.Math.Between(0, camps.length - 1)] : null;
    const faction = sourceCamp ? sourceCamp.faction : this.pickRaidFaction();
    const threat = getThreatLevel();
    const tier = getEscalationTier();
    const maxUnits = Math.round(
      RAID_MIN_UNITS + (RAID_MAX_UNITS_ESCALATED - RAID_MIN_UNITS) * threat + tier * RAID_UNITS_PER_ESCALATION_TIER,
    );
    const cappedMaxUnits = Math.min(RAID_ABSOLUTE_MAX_UNITS, Math.max(RAID_MIN_UNITS, maxUnits));
    const count = Phaser.Math.Between(RAID_MIN_UNITS, cappedMaxUnits);
    const hpMultiplier = 1 + (RAID_MAX_HP_MULTIPLIER - 1) * threat + tier * RAID_HP_PER_ESCALATION_TIER;

    this.raidActive = true;
    this.raidWarningTimer?.remove();
    this.raidWarningTimer = null;
    this.showRaidNotice(faction, count, threat, sourceCamp !== null, tier);
    // Phase 59: one tension stinger per wave, ducking the ambient music bus
    // briefly so it reads clearly - see audio/sound.ts's playRaidStinger.
    playRaidStinger();
    const origin = sourceCamp ? { x: sourceCamp.x, y: sourceCamp.y } : undefined;
    for (let i = 0; i < count; i++) {
      this.spawnRaider(faction, hpMultiplier, origin, tier);
    }

    this.raidWaveTimer = this.scene.time.delayedCall(RAID_WAVE_TIMEOUT_MS, () => this.endRaidWave());
  }

  /**
   * Phase 44: the temporary on-screen banner (raidNoticeText) stays exactly
   * as it was - this only additionally appends the same message to the
   * persistent notification log, so a raid a player didn't catch live is
   * still visible afterward. No buildingId: a raid targets whichever building
   * each raider individually picks, not one fixed location.
   *
   * Phase 80: the threat-based label (Large/Organized/plain) is unchanged -
   * it still tops out exactly as before at threat 1.0. escalationTier adds a
   * further prefix once escalation has actually started, so a player can
   * tell the difficulty is still climbing well past the point threat itself
   * pins at max.
   */
  private showRaidNotice(
    faction: RaiderFaction,
    count: number,
    threat: number,
    fromCamp = false,
    escalationTier = 0,
  ): void {
    const sizeTier = threat >= 0.66 ? 'Large ' : threat >= 0.33 ? 'Organized ' : '';
    const escalationLabel = this.getEscalationTierLabel(escalationTier);
    const originText = fromCamp ? ' from their camp' : '';
    const message = `${escalationLabel}${sizeTier}${RAIDER_DEFINITIONS[faction].label} raid${originText} - ${count} incoming!`;
    this.raidNoticeText.setText(message);
    this.raidNoticeText.setVisible(true);
    addNotification(message, 'danger', getElapsedSeconds());
  }

  /**
   * Phase 80: today's size-tier labels (Large/Organized) top out at
   * threat 1.0. These additional prefixes surface getEscalationTier()'s
   * otherwise-invisible unbounded climb past that point - tier 0 renders as
   * '' so a non-escalated wave's notice text is byte-for-byte unchanged.
   */
  private getEscalationTierLabel(tier: number): string {
    if (tier <= 0) {
      return '';
    }
    if (tier === 1) {
      return 'Escalated ';
    }
    if (tier === 2) {
      return 'Fearsome ';
    }
    if (tier === 3) {
      return 'Brutal ';
    }
    return `Apocalyptic (Tier ${tier}) `;
  }

  private hideRaidNotice(): void {
    this.raidNoticeText.setVisible(false);
  }

  // ---------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------

  /** origin (Phase 57): when a wave is sourced from a Raider Camp, every raider spawns at that camp's position instead of a random pickRaidSpawnPoint() edge point. */
  private spawnRaider(
    faction: RaiderFaction,
    hpMultiplier = 1,
    origin?: { x: number; y: number },
    escalationTier = 0,
  ): void {
    const spawn = origin ?? this.pickRaidSpawnPoint();
    const definition = RAIDER_DEFINITIONS[faction];

    const image = this.scene.add
      .image(spawn.x, spawn.y, RAIDERS_ATLAS_KEY, raiderTextureKey(faction))
      .setDisplaySize(RAIDER_SPRITE_SIZE, RAIDER_SPRITE_SIZE)
      .setDepth(RAIDER_SPRITE_DEPTH);

    // Phase 80: elite is a per-instance roll/bonus, exactly like the
    // existing hpMultiplier convention right below - RAIDER_DEFINITIONS
    // itself is never written to, only read from.
    const isElite = escalationTier >= ELITE_RAIDER_MIN_TIER && Math.random() < ELITE_RAIDER_FRACTION;
    const eliteHpMultiplier = isElite ? ELITE_RAIDER_HP_MULTIPLIER : 1;
    const damageMultiplier = isElite ? ELITE_RAIDER_DAMAGE_MULTIPLIER : 1;

    if (isElite) {
      image.setTint(ELITE_RAIDER_TINT);
    }

    const scaledMaxHp = Math.round(definition.maxHp * hpMultiplier * eliteHpMultiplier);
    const raider: Raider = {
      id: `raider-${this.raiderIdCounter++}`,
      image,
      faction,
      hp: scaledMaxHp,
      maxHp: scaledMaxHp,
      damageMultiplier,
      isElite,
      targetBuildingId: null,
      arrived: false,
      detouring: false,
    };
    this.raiders.push(raider);
    this.updateRaiderTargeting(raider);
  }

  /**
   * Random point along one of the 4 map edges, in world pixels; already
   * within bounds by construction since each axis is drawn from
   * [0, map-dimension-px]. Public: Hostile Wildlife (Phase 71, MainScene)
   * also spawns from a random edge and reuses this exact picker rather than
   * duplicating it.
   */
  pickRaidSpawnPoint(): { x: number; y: number } {
    const mapWidthPx = MAP_WIDTH_TILES * TILE_SIZE;
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE;
    const edge = Phaser.Math.Between(0, 3);

    switch (edge) {
      case 0:
        return { x: Phaser.Math.Between(0, mapWidthPx), y: 0 };
      case 1:
        return { x: mapWidthPx, y: Phaser.Math.Between(0, mapHeightPx) };
      case 2:
        return { x: Phaser.Math.Between(0, mapWidthPx), y: mapHeightPx };
      default:
        return { x: 0, y: Phaser.Math.Between(0, mapHeightPx) };
    }
  }

  // ---------------------------------------------------------------------
  // Targeting / pathing
  // ---------------------------------------------------------------------

  /**
   * Only reassigns a target when the current one is missing/dead - a raider
   * commits to its target once and walks there a single time (per the phase
   * spec), it does not re-evaluate "nearest" on every leg like villagers do.
   * Called once at spawn (target starts null) and again each combat tick so
   * a raider whose target died (or that spawned with none, e.g. an empty
   * map) can pick up a newly-valid building without needing its own timer.
   *
   * Phase 61: early-returns while `detouring` is set - a raider mid-detour-
   * leg (see resolveWallInteraction/findWallDetourPoint) has a null/stale
   * targetBuildingId by design, and re-entering this normally would
   * interrupt its detour tween every combat tick. The detour's own
   * onComplete clears the flag and calls this again from the raider's new
   * (closer, hopefully unblocked) position.
   */
  updateRaiderTargeting(raider: Raider): void {
    if (raider.detouring) {
      return;
    }

    const currentTarget = raider.targetBuildingId ? getBuildingById(raider.targetBuildingId) : null;
    if (currentTarget && currentTarget.hp > 0) {
      return;
    }

    const definition = RAIDER_DEFINITIONS[raider.faction];
    const next = this.pickRaiderTarget(definition, raider.image.x, raider.image.y);
    if (!next) {
      raider.targetBuildingId = null;
      raider.arrived = false;
      this.scene.tweens.killTweensOf(raider.image);
      return;
    }

    const { attackTarget, detourPoint } = this.resolveWallInteraction(raider.image.x, raider.image.y, next);

    if (detourPoint) {
      raider.arrived = false;
      raider.detouring = true;
      this.sendRaiderToPoint(raider, detourPoint, definition.speedPxPerSec, () => {
        raider.detouring = false;
        this.updateRaiderTargeting(raider);
      });
      return;
    }

    raider.targetBuildingId = attackTarget.id;
    raider.arrived = false;
    this.sendRaiderToTarget(raider, attackTarget);
  }

  /**
   * Phase 38: the "nearest (preferred-type) building" pick, unchanged - wall
   * interaction (attack vs. detour) was split out into resolveWallInteraction
   * in Phase 61 so this stays a pure "what's my real target" query.
   */
  private pickRaiderTarget(definition: RaiderDefinition, x: number, y: number): PlacedBuilding | null {
    let target: PlacedBuilding | null = null;
    if (definition.targeting === 'farm-preferred') {
      target = this.findNearestBuilding(x, y, (building) => !!BUILDING_DEFINITIONS[building.type].animal);
    }
    if (!target) {
      target = this.findNearestBuilding(x, y, () => true);
    }
    return target;
  }

  /**
   * Phase 61: given a raider's real target (from pickRaiderTarget), decides
   * what it should actually walk toward this tick. If the target is itself a
   * Fence, or nothing blocks the straight line to it, nothing changes from
   * Phase 38 - attackTarget is just the real target. If a live Fence blocks
   * the line, findWallDetourPoint gets one bounded shot at finding a nearby
   * gap (a Gate, or simply a spot where the wall doesn't reach) before
   * falling back to Phase 38's original behavior of attacking the blocking
   * Fence outright. This Fence branch/fallback is completely unchanged by
   * Phase 68 - verified by re-reading it after the WoodenWall branch below
   * was added.
   *
   * Phase 68: a WoodenWall blocker skips the detour attempt entirely and goes
   * straight to attacking it - a raider must destroy a Wall to get through,
   * it never tries to walk around one the way it does a Fence.
   *
   * Phase 69: a CLOSED WoodenGate is treated identically to a WoodenWall
   * blocker here - same attack-only, no-detour branch. An OPEN WoodenGate
   * never reaches this branch at all: blocksRaiderMovement (buildingConfig.ts)
   * only returns true for a WoodenGate when gateOpen === false, so
   * findBlockingWall/sampleForBlockingWall (which both gate on that same
   * predicate) simply never report an open WoodenGate as a blocker in the
   * first place - no special-case "is it open" check is needed here, it falls
   * out of the shared predicate for free.
   */
  private resolveWallInteraction(
    x: number,
    y: number,
    target: PlacedBuilding,
  ): { attackTarget: PlacedBuilding; detourPoint: { x: number; y: number } | null } {
    if (target.type === BuildingType.Fence) {
      return { attackTarget: target, detourPoint: null };
    }

    const blocking = this.findBlockingWall(x, y, target);
    if (!blocking) {
      return { attackTarget: target, detourPoint: null };
    }

    if (blocking.type === BuildingType.WoodenWall || blocking.type === BuildingType.WoodenGate) {
      return { attackTarget: blocking, detourPoint: null };
    }

    const detourPoint = this.findWallDetourPoint(x, y, target);
    if (detourPoint) {
      return { attackTarget: target, detourPoint };
    }

    return { attackTarget: blocking, detourPoint: null };
  }

  private findNearestBuilding(
    x: number,
    y: number,
    predicate: (building: PlacedBuilding) => boolean,
  ): PlacedBuilding | null {
    let best: PlacedBuilding | null = null;
    let bestDistance = Infinity;

    for (const building of getPlacedBuildings()) {
      if (building.hp <= 0 || !predicate(building)) {
        continue;
      }
      const center = this.scene.tileCenter(building);
      const distance = Phaser.Math.Distance.Between(x, y, center.x, center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }

    return best;
  }

  /**
   * Phase 38, refactored in Phase 61 into a thin wrapper around
   * sampleForBlockingWall (see that method's doc comment for the actual
   * sampling logic) - kept as its own method since it's the one call site
   * that always samples all the way out to a target building's tile-center
   * and excludes that target's own id. Renamed from findBlockingFence in
   * Phase 68 since it now also finds a blocking WoodenWall.
   */
  private findBlockingWall(x: number, y: number, target: PlacedBuilding): PlacedBuilding | null {
    const center = this.scene.tileCenter(target);
    return this.sampleForBlockingWall(x, y, center.x, center.y, target.id);
  }

  /**
   * Phase 38's original straight-line sample, generalized in Phase 61 to
   * take two raw points instead of always ending at a target building's
   * center - findWallDetourPoint below needs to sample short raider-to-
   * candidate and candidate-to-target legs, not just raider-to-target. Still
   * no grid pathfinding: half-tile steps along one straight segment,
   * returning the first live blocking-type tile crossed (the segment nearest
   * the start point, since sampling walks outward from it). Gate is
   * deliberately not checked here - see buildingConfig.ts's Gate doc comment
   * - so a Gate tile never blocks this sample.
   *
   * Phase 68: renamed from sampleForBlockingFence and the hardcoded
   * `type === BuildingType.Fence` check replaced with the shared
   * blocksRaiderMovement predicate (buildingConfig.ts), so this now also
   * stops at a live WoodenWall, not just a Fence.
   *
   * Public: Hostile Wildlife's hunting AI (Phase 71, MainScene) also reuses
   * this exact sample to decide whether a chase is blocked, rather than
   * duplicating the technique.
   */
  sampleForBlockingWall(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    excludeBuildingId?: string,
  ): PlacedBuilding | null {
    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(distance / (TILE_SIZE / 2)));
    const seen = new Set<string>();

    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      const sampleTileX = Math.floor((x1 + (x2 - x1) * t) / TILE_SIZE);
      const sampleTileY = Math.floor((y1 + (y2 - y1) * t) / TILE_SIZE);
      const key = `${sampleTileX},${sampleTileY}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const building = getBuildingAtTile(sampleTileX, sampleTileY);
      if (building && building.id !== excludeBuildingId && blocksRaiderMovement(building)) {
        return building;
      }
    }

    return null;
  }

  /**
   * Phase 61: bounded local search for a way around a wall segment blocking
   * the raider's straight line to `target` - deliberately NOT pathfinding,
   * same scoping call Phase 38 made for findBlockingWall itself. Tries
   * RAIDER_WALL_DETOUR_OFFSETS_TILES (1 and 2 tiles) to both sides,
   * perpendicular to the raider->target line, for 4 point samples total:
   * - skips a candidate that lands inside a live blocking tile (nowhere to
   *   stand),
   * - checks the short raider->candidate leg is itself clear,
   * - checks the longer candidate->target leg is clear (a Gate anywhere
   *   along either leg is fine, since sampleForBlockingWall never treats
   *   Gate as blocking).
   * The first fully-clear candidate is returned as a one-leg waypoint; the
   * raider walks there, then updateRaiderTargeting re-resolves fresh from
   * that position. Two tiles is enough to find a Gate placed in an
   * otherwise-solid wall line or a narrow gap without ever simulating a grid
   * search - if nothing clears within that radius the wall is treated as
   * solid there and the raider falls back to attacking it (Phase 38
   * behavior, unchanged).
   *
   * Phase 68: this method is only ever reached for a Fence blocker -
   * resolveWallInteraction skips straight to attacking a WoodenWall blocker
   * without calling findWallDetourPoint at all - but its own candidate-
   * occupancy check was still hardcoded to Fence, so it's widened to the
   * shared blocksRaiderMovement predicate too for consistency (a WoodenWall
   * candidate tile must never be treated as "nowhere to stand" open ground
   * here either, on the off chance this is ever called for another blocker
   * type in the future).
   */
  private findWallDetourPoint(x: number, y: number, target: PlacedBuilding): { x: number; y: number } | null {
    const center = this.scene.tileCenter(target);
    const dx = center.x - x;
    const dy = center.y - y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      return null;
    }

    const perpX = -dy / length;
    const perpY = dx / length;
    const mapWidthPx = MAP_WIDTH_TILES * TILE_SIZE;
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE;

    for (const offsetTiles of RAIDER_WALL_DETOUR_OFFSETS_TILES) {
      for (const side of [-1, 1]) {
        const offsetPx = offsetTiles * TILE_SIZE * side;
        const candidateX = Phaser.Math.Clamp(x + perpX * offsetPx, 0, mapWidthPx);
        const candidateY = Phaser.Math.Clamp(y + perpY * offsetPx, 0, mapHeightPx);

        const candidateTileX = Math.floor(candidateX / TILE_SIZE);
        const candidateTileY = Math.floor(candidateY / TILE_SIZE);
        const occupant = getBuildingAtTile(candidateTileX, candidateTileY);
        if (occupant && blocksRaiderMovement(occupant)) {
          continue;
        }

        if (this.sampleForBlockingWall(x, y, candidateX, candidateY, target.id)) {
          continue;
        }
        if (this.sampleForBlockingWall(candidateX, candidateY, center.x, center.y, target.id)) {
          continue;
        }

        return { x: candidateX, y: candidateY };
      }
    }

    return null;
  }

  /** Single point-to-point tween, same walk-speed/duration technique as Phase 20's villagers - but with no onComplete chain back into another leg, since this raider's target never moves. */
  private sendRaiderToTarget(raider: Raider, target: PlacedBuilding): void {
    const definition = RAIDER_DEFINITIONS[raider.faction];
    const center = this.scene.tileCenter(target);
    this.sendRaiderToPoint(raider, center, definition.speedPxPerSec, () => {
      raider.arrived = true;
    });
  }

  /**
   * Phase 61: generalization of sendRaiderToTarget's tween to any raw point,
   * not just a target building's center - used both by sendRaiderToTarget
   * itself and by updateRaiderTargeting's detour leg (which walks to a
   * findWallDetourPoint waypoint, not a building).
   */
  private sendRaiderToPoint(
    raider: Raider,
    point: { x: number; y: number },
    speedPxPerSec: number,
    onComplete: () => void,
  ): void {
    const distance = Phaser.Math.Distance.Between(raider.image.x, raider.image.y, point.x, point.y);
    const duration = (distance / speedPxPerSec) * 1000;

    raider.image.setFlipX(point.x < raider.image.x);

    this.scene.tweens.add({
      targets: raider.image,
      x: point.x,
      y: point.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete,
    });
  }

  // ---------------------------------------------------------------------
  // Combat resolution (raid-only slice; runRaidCombatTick's shooter
  // resolution stays on MainScene since it is fused with wildlife combat)
  // ---------------------------------------------------------------------

  /**
   * Phase 31: raiders shoot back at the defenders. A raider prefers any
   * living unit within RAIDER_UNIT_ATTACK_RANGE_TILES over its building
   * target - defending cowboys used to be invulnerable, which made combat a
   * one-sided damage race the player could never lose - and only falls back
   * to chewing on the building when no defender is close enough.
   *
   * Note it can fight a unit before `arrived` is true: a raider walking past
   * a cowboy will engage it, whereas hitting a building still requires having
   * actually reached it.
   */
  resolveRaiderAttacks(): void {
    const unitRangePx = RAIDER_UNIT_ATTACK_RANGE_TILES * TILE_SIZE;

    for (const raider of this.raiders) {
      const definition = RAIDER_DEFINITIONS[raider.faction];
      // Phase 80: per-instance elite bonus, RAIDER_DEFINITIONS.damage itself
      // is only ever read here, never written to.
      const damage = definition.damage * raider.damageMultiplier;

      const defender = this.scene.findNearestUnit(raider.image.x, raider.image.y, unitRangePx);
      if (defender) {
        const remaining = damageUnit(defender.barracksId, defender.kind, defender.index, damage);
        if (remaining <= 0) {
          this.scene.killUnit(defender);
        }
        continue;
      }

      if (!raider.arrived || !raider.targetBuildingId) {
        continue;
      }
      const target = getBuildingById(raider.targetBuildingId);
      if (!target || target.hp <= 0) {
        continue;
      }
      target.hp = Math.max(0, target.hp - damage);
      this.scene.minimapSystem.registerMinimapBuildingDamage(target);
    }
  }

  findNearestRaider(x: number, y: number, maxDistance: number): Raider | null {
    let best: Raider | null = null;
    let bestDistance = maxDistance;

    for (const raider of this.raiders) {
      if (raider.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, raider.image.x, raider.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = raider;
      }
    }

    return best;
  }

  /** Nearest live raider to a world point within RAIDER_ATTACK_HIT_RADIUS_PX, or null - the hit-test that tells a right-click-on-a-raider (attack order) apart from a right-click-on-ground (move order). */
  findRaiderAt(worldX: number, worldY: number): Raider | null {
    let best: Raider | null = null;
    let bestDistance = RAIDER_ATTACK_HIT_RADIUS_PX;

    for (const raider of this.raiders) {
      if (raider.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(worldX, worldY, raider.image.x, raider.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = raider;
      }
    }

    return best;
  }

  /** Nearest live Raider Camp to a world point within RAIDER_CAMP_ATTACK_HIT_RADIUS_PX, or null - mirrors findRaiderAt exactly, checked second in the pointerup handler so an overlapping raider always wins the hit-test. */
  findCampAt(worldX: number, worldY: number): RaiderCamp | null {
    let best: RaiderCamp | null = null;
    let bestDistance = RAIDER_CAMP_ATTACK_HIT_RADIUS_PX;

    for (const camp of getRaiderCamps()) {
      const distance = Phaser.Math.Distance.Between(worldX, worldY, camp.x, camp.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = camp;
      }
    }

    return best;
  }

  removeDeadRaiders(): void {
    const survivors: Raider[] = [];
    for (const raider of this.raiders) {
      if (raider.hp > 0) {
        survivors.push(raider);
        continue;
      }
      this.scene.tweens.killTweensOf(raider.image);
      playWorldSound('unitDeath', raider.image.x, raider.image.y);
      raider.image.destroy();
    }
    this.raiders = survivors;

    if (this.raidActive && this.raiders.length === 0) {
      this.endRaidWave();
    }
  }

  /** Reached either when every raider in the wave is dead (removeDeadRaiders) or the wave timeout fires - whichever comes first. */
  private endRaidWave(): void {
    if (!this.raidActive) {
      return;
    }
    this.raidActive = false;
    this.raidWaveTimer?.remove();
    this.raidWaveTimer = null;
    this.hideRaidNotice();

    for (const raider of this.raiders) {
      this.scene.tweens.killTweensOf(raider.image);
      raider.image.destroy();
    }
    this.raiders = [];
  }

  /**
   * Cancels the pending raid-check timer entirely (rather than letting it
   * fire on stale timing) and starts a fresh one with a new random delay, so
   * a just-reset game doesn't inherit a countdown from the previous run.
   */
  resetRaidState(): void {
    this.raidWaveTimer?.remove();
    this.raidWaveTimer = null;
    this.raidCheckTimer?.remove();
    this.raidCheckTimer = null;
    this.raidWarningTimer?.remove();
    this.raidWarningTimer = null;

    for (const raider of this.raiders) {
      this.scene.tweens.killTweensOf(raider.image);
      raider.image.destroy();
    }
    this.raiders = [];

    for (const shot of this.scene.cowboyShotGraphics) {
      this.scene.tweens.killTweensOf(shot);
      shot.destroy();
    }
    this.scene.cowboyShotGraphics = [];

    this.raidActive = false;
    this.hideRaidNotice();

    // Phase 45: a wave's damage flashes/off-screen pings are wave-scoped like
    // everything else reset here - a flash left over from the previous run
    // would otherwise render at a stale tile until it happened to expire.
    this.scene.minimapSystem.minimapBuildingFlashes.clear();
    this.scene.minimapSystem.offscreenThreats.clear();

    this.scheduleNextRaidCheck();
  }

  /**
   * Phase 34/85: called from MainScene's 'game-over' handler alongside its
   * own cleanup. Exact behavior preserved from the pre-extraction inline
   * sequence: end the active wave first (destroys any live raiders, clears
   * raidActive, removes raidWaveTimer, hides the notice), then also cancel
   * the check/warning timers and hide the notice again (both already
   * no-ops in the common case, kept for byte-for-byte parity).
   */
  haltForGameOver(): void {
    this.endRaidWave();
    this.raidCheckTimer?.remove();
    this.raidCheckTimer = null;
    this.raidWarningTimer?.remove();
    this.raidWarningTimer = null;
    this.raidWaveTimer?.remove();
    this.raidWaveTimer = null;
    this.hideRaidNotice();
  }

  // ---------------------------------------------------------------------
  // Raider Camps (Phase 57)
  // ---------------------------------------------------------------------

  /**
   * Phase 57: Raider Camps (Offense Phase). Camps are persistent hostile
   * structures rather than another wave-scoped combat entity, so their
   * existence/hp live in state/raiderCamps.ts (Phase 52-style persistence,
   * see that module's doc comment) instead of alongside the ephemeral
   * Raider[]/raidActive state above. This scene still owns every camp's
   * sprite (campVisuals) and decides *when* the initial batch appears -
   * once, on the first dawn at/after RAIDER_CAMP_SPAWN_DAY, mirroring the
   * once-per-dawn guard setupSaveLoad's autosave already uses.
   */
  setupRaiderCamps(): void {
    gameEvents.on('day-phase-changed', ({ dayNumber, phase }: DayPhaseChange) => {
      if (this.initialCampsSpawned || phase !== 'day' || dayNumber < RAIDER_CAMP_SPAWN_DAY) {
        return;
      }
      this.initialCampsSpawned = true;
      this.spawnInitialRaiderCamps();
    });
  }

  private spawnInitialRaiderCamps(): void {
    const count = Phaser.Math.Between(RAIDER_CAMP_MIN_COUNT, RAIDER_CAMP_MAX_COUNT);
    for (let i = 0; i < count; i++) {
      const spawn = this.pickRaidSpawnPoint();
      const faction = this.pickRaidFaction();
      const camp = spawnRaiderCamp(spawn.x, spawn.y, faction, RAIDER_CAMP_MAX_HP);
      this.createCampVisual(camp);
    }
    this.scene.minimapSystem.redrawMinimap();
  }

  private createCampVisual(camp: RaiderCamp): void {
    const image = this.scene.add
      .image(camp.x, camp.y, RAIDER_CAMPS_ATLAS_KEY, raiderCampTextureKey(camp.faction))
      .setDisplaySize(RAIDER_CAMP_SPRITE_SIZE, RAIDER_CAMP_SPRITE_SIZE)
      .setDepth(RAIDER_CAMP_SPRITE_DEPTH);
    this.campVisuals.set(camp.id, image);
  }

  /** Called from setupSaveLoad's 'game-loaded' handler - rebuilds every persisted camp's sprite from state/raiderCamps.ts, mirroring restoreBuildingVisual's role for PlacedBuildings. */
  restoreCampVisuals(): void {
    for (const camp of getRaiderCamps()) {
      this.createCampVisual(camp);
    }
  }

  /** Called from setupSaveLoad's 'game-loaded' handler: sets whether the once-per-run initial camp spawn should still be considered pending, based on the loaded day number rather than merely on whether any camp currently exists. */
  notifyLoadedDayNumber(dayNumber: number): void {
    this.initialCampsSpawned = dayNumber >= RAIDER_CAMP_SPAWN_DAY;
  }

  /**
   * Applies a unit's shot to a camp: the shot-line visual (same
   * spawnCowboyShotVisual helper a raider hit uses) plus the actual hp
   * mutation, routed through state/raiderCamps.ts's damageRaiderCamp so gameState's
   * sibling module stays the single source of truth for camp hp exactly like
   * building.hp is for buildings.
   */
  damageCamp(camp: RaiderCamp, amount: number, shooterPosition: { x: number; y: number }): void {
    const image = this.campVisuals.get(camp.id);
    if (image) {
      this.scene.spawnCowboyShotVisual(shooterPosition, image);
    }
    const remaining = damageRaiderCamp(camp.id, amount);
    if (remaining !== null && remaining <= 0) {
      this.destroyRaiderCamp(camp);
    }
  }

  /**
   * A camp reaching 0 hp is removed outright (no repair/rebuild path, unlike
   * a PlacedBuilding) and drops a flat loot reward - the whole point of the
   * offense phase is that raiding a camp is worth the trip. Any unit still
   * holding an attack order on this camp has it cleared the same way
   * resolveUnitAttackOrders already clears one pointed at a dead raider.
   */
  private destroyRaiderCamp(camp: RaiderCamp): void {
    const image = this.campVisuals.get(camp.id);
    if (image) {
      this.scene.tweens.killTweensOf(image);
      image.destroy();
      this.campVisuals.delete(camp.id);
    }
    removeRaiderCamp(camp.id);

    for (const unit of this.scene.cowboyUnits) {
      if (unit.attackTarget?.kind === 'camp' && unit.attackTarget.id === camp.id) {
        unit.attackTarget = null;
      }
    }

    this.scene.spawnDustBurstAt(camp.x, camp.y);
    playWorldSound('buildingCollapse', camp.x, camp.y);

    grantRaiderCampLoot(RAIDER_CAMP_LOOT_MONEY, { tools: RAIDER_CAMP_LOOT_TOOLS });
    const message = `${RAIDER_DEFINITIONS[camp.faction].label} camp destroyed! +$${RAIDER_CAMP_LOOT_MONEY}, +${RAIDER_CAMP_LOOT_TOOLS} Tools`;
    addNotification(message, 'info', getElapsedSeconds());

    this.scene.minimapSystem.redrawMinimap();
  }

  /**
   * Mirrors the villager/unit cleanup setupGameReset already does for its own
   * kind: gameState.resetGame() already cleared the underlying camp list
   * (its own resetRaiderCamps() call), so this only tears down the now-
   * orphaned scene-side sprites and re-arms the once-per-run initial spawn.
   */
  resetRaiderCampVisuals(): void {
    for (const image of this.campVisuals.values()) {
      this.scene.tweens.killTweensOf(image);
      image.destroy();
    }
    this.campVisuals.clear();
    this.initialCampsSpawned = false;
  }
}
