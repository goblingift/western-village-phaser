import Phaser from 'phaser';
import {
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  POPULATION_PER_HOUSE,
  TILE_SIZE,
  WILDLIFE_FLEE_HP_FRACTION,
  MAX_CONCURRENT_WILDLIFE,
  WILDLIFE_MAX_INTERVAL_MS,
  WILDLIFE_MIN_INTERVAL_MS,
  WILDLIFE_VILLAGER_HP,
} from '../../config/constants';
import {
  ANIMAL_SPRITE_SIZE,
  BuildingType,
  CARTS_ATLAS_KEY,
  CART_TEXTURE_KEY,
  PlacedBuilding,
  VILLAGERS_ATLAS_KEY,
  VILLAGER_TEXTURE_KEY,
} from '../../config/buildingConfig';
import {
  WILDLIFE_ATLAS_KEY,
  WILDLIFE_DEFINITIONS,
  WildlifeKind,
  pickRandomWildlifeKind,
  wildlifeTextureKey,
} from '../../config/wildlifeConfig';
import { gameEvents } from '../../state/gameEvents';
import { addNotification } from '../../state/notifications';
import { damageUnit, getElapsedSeconds, getPlacedBuildings } from '../../state/gameState';
import { playWorldSound } from '../../audio/sound';
import type { CombatUnit, MainScene } from '../MainScene';

/** Above buildings (10), accents (10.5) and animals (11); below HP bars (13). */
const VILLAGER_SPRITE_DEPTH = 12;
/** Display-only cap (Phase 20): rendered sprite count, unrelated to gameState's population/workforce numbers. Raised 30 -> 40 (Phase 66) for the bigger, more populated 60x45 map. */
const VILLAGER_CAP = 40;
const VILLAGER_WALK_SPEED_PX_PER_SEC = 50;
const VILLAGER_PAUSE_MIN_MS = 500;
const VILLAGER_PAUSE_MAX_MS = 2000;

/**
 * Phase 60: Goods Carts on Roads - purely cosmetic, short-lived (one leg,
 * then fade out and destroy) so create-then-destroy is simpler than pooling
 * at this volume, mirroring the villager/animal small-unit depth band rather
 * than getting its own. Cap mirrors VILLAGER_CAP's "display-only cap,
 * skip-spawning-past-it" precedent.
 */
const MAX_VISIBLE_CARTS = 8;
const CART_WALK_SPEED_PX_PER_SEC = 40;
const CART_SPRITE_DEPTH = 11;
const CART_FADE_OUT_DURATION_MS = 300;
/** Depots a cart can travel to - every building type with an autonomous-sale or storage role, none of which have a `production` field so they can never themselves be the cart's *source*. */
const CART_DEPOT_BUILDING_TYPES: readonly BuildingType[] = [
  BuildingType.Warehouse,
  BuildingType.Supermarket,
  BuildingType.Saloon,
  BuildingType.TradingPost,
];

/**
 * Phase 71: Hostile Wildlife shares the raider/villager/animal small-unit
 * depth band. Hit-test radius mirrors RAIDER_ATTACK_HIT_RADIUS_PX so a
 * right-click-on-a-creature reads with the same forgiving tolerance as
 * right-click-on-a-raider does.
 */
const WILDLIFE_SPRITE_DEPTH = 12;
const WILDLIFE_ATTACK_HIT_RADIUS_PX = 10;
/** Roam-leg pacing, matching startVillagerWander's own pause band - wildlife idles between roam legs the same way a decorative villager does. */
const WILDLIFE_ROAM_PAUSE_MIN_MS = 500;
const WILDLIFE_ROAM_PAUSE_MAX_MS = 2000;
/** How far (world px) a fleeing creature's one-shot tween travels toward the nearest map edge before it despawns. */
const WILDLIFE_FLEE_SPEED_PX_PER_SEC = 90;

/**
 * Phase 71: promoted from a bare Phaser.GameObjects.Image[] (Phase 20) now
 * that a decorative villager can be killed by wildlife - it needs a stable
 * id (for wildlife.targetRef to survive across ticks the same way
 * Raider.id/CombatUnit.id already do) and its own hp. Deliberately still
 * NOT tied into gameState/totalPopulation in any way: this stays the exact
 * "capped cosmetic flourish decoupled from the real population figure" the
 * Phase 20 changelog documents - killing one only ever removes a sprite.
 */
export interface Villager {
  id: string;
  image: Phaser.GameObjects.Image;
  hp: number;
}

/**
 * Phase 71: Hostile Wildlife. Roams like a decorative villager (chained
 * random-point tweens) rather than committing to one target the way a raider
 * does, and only ever targets living units/villagers - never a building, see
 * runWildlifeTick. Tracked at scene level (mirroring Raider[]/CombatUnit[] in
 * MainScene) since it's ephemeral/tween-heavy, transient combat state, exactly
 * the category the codebase's own Raider precedent describes - not a
 * standalone state/ module like state/raiderCamps.ts, which is deliberately
 * a *persisted*, slowly-changing map objective that wildlife is not.
 */
export interface Wildlife {
  id: string;
  kind: WildlifeKind;
  image: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
  state: 'roaming' | 'hunting' | 'attacking' | 'fleeing';
  targetRef: { kind: 'unit'; unitId: string } | { kind: 'villager'; villagerId: string } | null;
  moveTween: Phaser.Tweens.Tween | null;
}

/**
 * Phase 86: MainScene Decomposition Part 2 - Ambient Life.
 *
 * A pure code-move out of MainScene.ts: decorative villagers (spawn/wander/
 * dawn top-up/death), Goods Carts on Roads (spawn/travel/depot delivery), and
 * the full Hostile Wildlife system (Phase 71 - spawn/roam/hunt/attack/flee
 * state machine). Follows RaidSystem.ts's exact plain-class pattern -
 * constructed once in MainScene.create() as `new AmbientLifeSystem(this)`.
 *
 * Cross-system dependency: wildlife's hunting AI reuses RaidSystem's
 * `pickRaidSpawnPoint` (a shared random-edge-point picker, unrelated to raid
 * waves themselves) and `sampleForBlockingWall` (the same straight-line wall
 * sample raiders use to detect a blocked path) - reached via
 * `this.scene.raidSystem` rather than a constructor-injected reference, since
 * MainScene already holds that reference by the time this system's methods
 * run and a second injected reference would just be a second name for the
 * same object.
 */
export class AmbientLifeSystem {
  private scene: MainScene;

  /** Phase 71: promoted from Phaser.GameObjects.Image[] to Villager[] - a decorative villager now has hp and can be killed by wildlife (see the Villager interface doc comment). */
  villagers: Villager[] = [];
  /** Phase 71: monotonically increasing so every Villager.id is unique for the life of the scene, mirroring raiderIdCounter/unitIdCounter. */
  private villagerIdCounter = 0;

  /** Phase 60: Goods Carts on Roads - short-lived travel sprites, tracked only so game-reset can kill their tweens and destroy them; MAX_VISIBLE_CARTS is enforced against this array's length. */
  private activeCarts: Phaser.GameObjects.Image[] = [];

  /**
   * Phase 71: Hostile Wildlife. An ambient hazard, not a wave/raid concept -
   * spawns continuously from minute one via its own self-rescheduling timer
   * (scheduleNextWildlifeCheck), independent of raidActive/night gating.
   */
  wildlife: Wildlife[] = [];
  private wildlifeIdCounter = 0;
  private wildlifeCheckTimer: Phaser.Time.TimerEvent | null = null;
  /** Fire-once-per-session debounce for the Mountain Lion spawn notification, so a run with several lions doesn't spam the log. */
  private mountainLionNotified = false;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  // ---------------------------------------------------------------------
  // Villagers
  // ---------------------------------------------------------------------

  /**
   * Spawns POPULATION_PER_HOUSE sprites per House placement (population
   * capacity, not employment - employment is recomputed every tick and
   * shouldn't churn sprites in/out). Capped at VILLAGER_CAP total for
   * performance, so a later House may spawn fewer (or none).
   *
   * Phase 46: deliberately NOT scaled by houseTier - this is a fixed
   * decorative flourish at placement time, whereas the workforce-relevant
   * population figure (gameState's totalPopulation, HUD's Pop X/Y) is
   * computed fresh from HOUSE_TIER_CONFIG every tick. Re-syncing rendered
   * sprite counts to a live tier would add churn/pooling complexity for a
   * purely cosmetic number already capped and decoupled from gameplay.
   */
  spawnVillagersForHouse(building: PlacedBuilding): void {
    const spawnCount = Math.min(POPULATION_PER_HOUSE, VILLAGER_CAP - this.villagers.length);
    const origin = this.scene.tileCenter(building);

    for (let index = 0; index < spawnCount; index++) {
      this.spawnOneVillagerAt(origin.x, origin.y);
    }
  }

  /**
   * Phase 71: extracted out of spawnVillagerForHouse's own loop body so
   * topUpVillagersOnDawn (which has no single origin building) can spawn a
   * replacement villager the same way - at a random placed building's tile
   * center, mirroring pickVillagerTarget's own fallback for an empty town.
   */
  private spawnOneVillagerAt(x: number, y: number): void {
    const image = this.scene.add
      .image(x, y, VILLAGERS_ATLAS_KEY, VILLAGER_TEXTURE_KEY)
      .setDisplaySize(ANIMAL_SPRITE_SIZE, ANIMAL_SPRITE_SIZE)
      .setDepth(VILLAGER_SPRITE_DEPTH);
    const villager: Villager = { id: `villager-${this.villagerIdCounter++}`, image, hp: WILDLIFE_VILLAGER_HP };
    this.villagers.push(villager);
    this.startVillagerWander(image);
  }

  /**
   * Phase 71: villager count is a capped cosmetic flourish (Phase 20),
   * decoupled from gameState's real totalPopulation - this only tops rendered
   * sprites back up toward VILLAGER_CAP after wildlife kills have thinned
   * them, it never touches population/workforce. Reuses the existing dawn
   * hook (day-phase-changed, phase === 'day') rather than inventing a new
   * schedule, and spawns each replacement at a random placed building the
   * same way pickVillagerTarget already picks a wander destination.
   */
  topUpVillagersOnDawn(): void {
    const missing = VILLAGER_CAP - this.villagers.length;
    if (missing <= 0) {
      return;
    }
    for (let index = 0; index < missing; index++) {
      const point = this.pickVillagerTarget();
      this.spawnOneVillagerAt(point.x, point.y);
    }
  }

  /**
   * Point-to-point wander, one leg at a time: each leg is its own tween,
   * chained via onComplete rather than a single repeating/yoyo tween, since
   * every leg goes to a fresh random target instead of bouncing between two
   * fixed points. `villager.active` is checked on every (re-)entry so a
   * pending post-reset callback (scheduled before game-reset destroyed this
   * sprite) quietly stops the loop instead of animating a dead image.
   */
  private startVillagerWander(villager: Phaser.GameObjects.Image): void {
    if (!villager.active) {
      return;
    }

    const target = this.pickVillagerTarget();
    const distance = Phaser.Math.Distance.Between(villager.x, villager.y, target.x, target.y);
    const duration = (distance / VILLAGER_WALK_SPEED_PX_PER_SEC) * 1000;

    villager.setFlipX(target.x < villager.x);

    this.scene.tweens.add({
      targets: villager,
      x: target.x,
      y: target.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        const pause = Phaser.Math.Between(VILLAGER_PAUSE_MIN_MS, VILLAGER_PAUSE_MAX_MS);
        this.scene.time.delayedCall(pause, () => this.startVillagerWander(villager));
      },
    });
  }

  /**
   * Random placed building's tile center, clamped to map bounds.
   *
   * Phase 31 made the empty-list case reachable for the first time: before
   * buildings could be destroyed or demolished, a villager's own House was
   * guaranteed to still be standing whenever this ran, so
   * `buildings[Between(0, -1)]` was unreachable. Now a town can lose every
   * last building while its villagers are still walking, so an empty list
   * falls back to a random point on the map rather than dereferencing
   * undefined.
   */
  private pickVillagerTarget(): { x: number; y: number } {
    const buildings = getPlacedBuildings();
    const mapWidthPx = MAP_WIDTH_TILES * TILE_SIZE;
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE;

    if (buildings.length === 0) {
      return {
        x: Phaser.Math.Between(0, mapWidthPx),
        y: Phaser.Math.Between(0, mapHeightPx),
      };
    }

    const building = buildings[Phaser.Math.Between(0, buildings.length - 1)];
    const center = this.scene.tileCenter(building);

    return {
      x: Phaser.Math.Clamp(center.x, 0, mapWidthPx),
      y: Phaser.Math.Clamp(center.y, 0, mapHeightPx),
    };
  }

  /**
   * A destroyed House takes its population with it (gameState recomputes
   * total population from the House count every tick), so the same number of
   * villager sprites has to go too or the town would keep visibly bustling
   * with people it no longer houses. Removed LIFO, mirroring the order
   * spawnVillagersForHouse added them under VILLAGER_CAP.
   */
  removeVillagersForLostHouse(): void {
    const removeCount = Math.min(POPULATION_PER_HOUSE, this.villagers.length);
    for (let index = 0; index < removeCount; index++) {
      const villager = this.villagers.pop();
      if (!villager) {
        break;
      }
      this.scene.tweens.killTweensOf(villager.image);
      villager.image.destroy();
    }
  }

  /** Mirrors killUnit's cleanup shape: kill tweens, dust puff, sound, destroy, drop from tracking. Never touches gameState/totalPopulation - see the Villager interface doc comment. */
  private killVillager(villager: Villager): void {
    this.scene.tweens.killTweensOf(villager.image);
    this.scene.spawnDeathPuff(villager.image.x, villager.image.y);
    playWorldSound('unitDeath', villager.image.x, villager.image.y);
    villager.image.destroy();
    this.villagers = this.villagers.filter((candidate) => candidate !== villager);
  }

  // ---------------------------------------------------------------------
  // Goods Carts on Roads
  // ---------------------------------------------------------------------

  /**
   * Phase 60: Goods Carts on Roads. Rides the same 'production-tick' event
   * every other per-tick redraw pass listens to, firing after
   * runProductionTick has already updated every PlacedBuilding's
   * `active`/`connected` flags for this tick (Roads & Logistics' existing
   * BFS - see gameState's updateConnections/isBuildingConnected - already
   * computes `connected`; `active` is set true at the exact point a building
   * successfully produced output this tick, see recordProductivityTick's call
   * sites in runProductionTick). No gameplay side effect: this only spawns a
   * cosmetic sprite, never touches resources/money/the +10% bonus itself.
   */
  setupGoodsCarts(): void {
    gameEvents.on('production-tick', () => {
      if (this.activeCarts.length >= MAX_VISIBLE_CARTS) {
        return;
      }

      const depots = getPlacedBuildings().filter(
        (building) =>
          CART_DEPOT_BUILDING_TYPES.includes(building.type) && building.connected && building.hp > 0,
      );
      if (depots.length === 0) {
        return;
      }

      for (const building of getPlacedBuildings()) {
        if (this.activeCarts.length >= MAX_VISIBLE_CARTS) {
          break;
        }
        if (!building.active || !building.connected) {
          continue;
        }

        const depot = this.findNearestCartDepot(building, depots);
        if (depot) {
          this.spawnGoodsCart(building, depot);
        }
      }
    });
  }

  /** Straight-line nearest-by-tile-center search, no road-tile pathfinding (Phase 38's raider-fence-blocking precedent: simple robust behavior over full pathfinding, since roads are decorative for this purpose). */
  private findNearestCartDepot(
    from: PlacedBuilding,
    depots: readonly PlacedBuilding[],
  ): PlacedBuilding | null {
    const origin = this.scene.tileCenter(from);
    let nearest: PlacedBuilding | null = null;
    let nearestDistance = Infinity;

    for (const depot of depots) {
      const center = this.scene.tileCenter(depot);
      const distance = Phaser.Math.Distance.Between(origin.x, origin.y, center.x, center.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = depot;
      }
    }

    return nearest;
  }

  /**
   * Single point-to-point tween, same walk-speed/duration technique as
   * startVillagerWander/RaidSystem's sendRaiderToTarget - but one-shot rather
   * than a forever-looping chain: on arrival it fades out and destroys itself
   * instead of picking a new leg, since a cart represents one delivery, not a
   * wandering resident.
   */
  private spawnGoodsCart(from: PlacedBuilding, to: PlacedBuilding): void {
    const origin = this.scene.tileCenter(from);
    const destination = this.scene.tileCenter(to);
    const distance = Phaser.Math.Distance.Between(origin.x, origin.y, destination.x, destination.y);
    const duration = (distance / CART_WALK_SPEED_PX_PER_SEC) * 1000;

    const cart = this.scene.add
      .image(origin.x, origin.y, CARTS_ATLAS_KEY, CART_TEXTURE_KEY)
      .setDepth(CART_SPRITE_DEPTH);
    cart.setFlipX(destination.x < origin.x);
    this.activeCarts.push(cart);

    this.scene.tweens.add({
      targets: cart,
      x: destination.x,
      y: destination.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        this.scene.tweens.add({
          targets: cart,
          alpha: 0,
          duration: CART_FADE_OUT_DURATION_MS,
          onComplete: () => {
            this.activeCarts = this.activeCarts.filter((image) => image !== cart);
            cart.destroy();
          },
        });
      },
    });
  }

  // ---------------------------------------------------------------------
  // Hostile Wildlife (Phase 71)
  // ---------------------------------------------------------------------

  /**
   * Phase 71: Hostile Wildlife. Self-rescheduling timer following
   * scheduleNextMerchantCheck's exact shape (roll a random delay, fire,
   * immediately roll the next one) - deliberately NO night-only/elapsed-time
   * gating the way raids have (canRaidSpawnNow/RAID_EARLIEST_ELAPSED_MS):
   * wildlife is an ambient world hazard from minute one, not a scheduled
   * threat window.
   */
  setupWildlifeSystem(): void {
    this.scheduleNextWildlifeCheck();
  }

  private scheduleNextWildlifeCheck(): void {
    const delay = Phaser.Math.Between(WILDLIFE_MIN_INTERVAL_MS, WILDLIFE_MAX_INTERVAL_MS);
    this.wildlifeCheckTimer = this.scene.time.delayedCall(delay, () => {
      this.spawnWildlifeCreature();
      this.scheduleNextWildlifeCheck();
    });
  }

  /** Skips spawning (but still reschedules) once MAX_CONCURRENT_WILDLIFE is reached - a cap, not a hard stop of the timer. */
  private spawnWildlifeCreature(): void {
    if (this.wildlife.length >= MAX_CONCURRENT_WILDLIFE) {
      return;
    }

    const kind = pickRandomWildlifeKind();
    const definition = WILDLIFE_DEFINITIONS[kind];
    const spawn = this.scene.raidSystem.pickRaidSpawnPoint();

    const image = this.scene.add
      .image(spawn.x, spawn.y, WILDLIFE_ATLAS_KEY, wildlifeTextureKey(kind))
      .setDepth(WILDLIFE_SPRITE_DEPTH);

    const creature: Wildlife = {
      id: `wildlife-${this.wildlifeIdCounter++}`,
      kind,
      image,
      hp: definition.maxHp,
      maxHp: definition.maxHp,
      state: 'roaming',
      targetRef: null,
      moveTween: null,
    };
    this.wildlife.push(creature);
    this.startWildlifeRoam(creature);

    if (kind === 'MountainLion' && !this.mountainLionNotified) {
      this.mountainLionNotified = true;
      addNotification('A Mountain Lion is prowling near your town.', 'warning', getElapsedSeconds());
    }
  }

  /**
   * Point-to-point wander, one leg at a time, closely mirroring
   * startVillagerWander's own chained-tween technique (a close copy adapted
   * for Wildlife's own record/state rather than a shared helper, matching
   * the codebase's existing precedent of villager-wander and raider-tween
   * being separate, purpose-specific implementations). Only ever called
   * while state === 'roaming'; runWildlifeTick switches a creature straight
   * into 'hunting' (its own fresh tween) the moment prey is found, so this
   * loop's onComplete re-checks state before continuing itself.
   */
  private startWildlifeRoam(creature: Wildlife): void {
    if (!creature.image.active || creature.state !== 'roaming') {
      return;
    }

    const target = this.pickVillagerTarget();
    const definition = WILDLIFE_DEFINITIONS[creature.kind];
    const distance = Phaser.Math.Distance.Between(creature.image.x, creature.image.y, target.x, target.y);
    const duration = (distance / definition.speedPxPerSec) * 1000;

    creature.image.setFlipX(target.x < creature.image.x);

    creature.moveTween = this.scene.tweens.add({
      targets: creature.image,
      x: target.x,
      y: target.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        creature.moveTween = null;
        if (creature.state !== 'roaming') {
          return;
        }
        const pause = Phaser.Math.Between(WILDLIFE_ROAM_PAUSE_MIN_MS, WILDLIFE_ROAM_PAUSE_MAX_MS);
        this.scene.time.delayedCall(pause, () => this.startWildlifeRoam(creature));
      },
    });
  }

  /**
   * Runs on the same ~2s combat-tick cadence as raid combat (called from
   * MainScene's runRaidCombatTick), not per-frame - wildlife re-paths every
   * tick while hunting (unlike a raider, which commits to one target and
   * walks there once) since its prey (a unit/villager) keeps moving.
   */
  runWildlifeTick(): void {
    for (const creature of this.wildlife) {
      this.updateWildlifeCreature(creature);
    }
    this.removeDeadWildlife();
  }

  private updateWildlifeCreature(creature: Wildlife): void {
    if (creature.state === 'fleeing') {
      // Handled entirely by the one-shot flee tween's onComplete (see
      // startWildlifeFlee) - despawns the creature once it reaches the edge.
      return;
    }

    const definition = WILDLIFE_DEFINITIONS[creature.kind];
    if (creature.hp / creature.maxHp < WILDLIFE_FLEE_HP_FRACTION) {
      this.startWildlifeFlee(creature);
      return;
    }

    const detectionRangePx = definition.detectionRadiusTiles * TILE_SIZE;
    const prey = this.findNearestPrey(creature.image.x, creature.image.y, detectionRangePx);

    if (!prey) {
      if (creature.state !== 'roaming') {
        creature.state = 'roaming';
        creature.targetRef = null;
        this.scene.tweens.killTweensOf(creature.image);
        creature.moveTween = null;
        this.startWildlifeRoam(creature);
      }
      return;
    }

    const attackRangePx = definition.attackRangeTiles * TILE_SIZE;
    const distanceToPrey = Phaser.Math.Distance.Between(creature.image.x, creature.image.y, prey.x, prey.y);

    if (distanceToPrey <= attackRangePx) {
      creature.state = 'attacking';
      creature.targetRef = prey.ref;
      this.scene.tweens.killTweensOf(creature.image);
      creature.moveTween = null;
      this.applyWildlifeDamage(prey.ref, definition.damage);
      return;
    }

    // Blocked by a Wall/Gate: wildlife does NOT get a raider-style detour or
    // attack-the-wall fallback - keeping wildlife pathing simple (per the
    // design intent) means a blocked hunt is simply abandoned this tick, and
    // re-evaluated fresh next tick rather than committing to a path around
    // the obstacle.
    if (this.scene.raidSystem.sampleForBlockingWall(creature.image.x, creature.image.y, prey.x, prey.y)) {
      if (creature.state !== 'roaming') {
        creature.state = 'roaming';
        creature.targetRef = null;
        this.scene.tweens.killTweensOf(creature.image);
        creature.moveTween = null;
        this.startWildlifeRoam(creature);
      }
      return;
    }

    creature.state = 'hunting';
    creature.targetRef = prey.ref;
    this.scene.tweens.killTweensOf(creature.image);
    const distance = distanceToPrey;
    const duration = (distance / definition.speedPxPerSec) * 1000;
    creature.image.setFlipX(prey.x < creature.image.x);
    creature.moveTween = this.scene.tweens.add({
      targets: creature.image,
      x: prey.x,
      y: prey.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        creature.moveTween = null;
      },
    });
  }

  /**
   * Nearest live unit OR villager within maxDistance - wildlife never
   * targets a building (grepped for and confirmed absent from every branch
   * above: only cowboyUnits/this.villagers are consulted here).
   */
  private findNearestPrey(
    x: number,
    y: number,
    maxDistance: number,
  ): { x: number; y: number; ref: { kind: 'unit'; unitId: string } | { kind: 'villager'; villagerId: string } } | null {
    let bestDistance = maxDistance;
    let best: { x: number; y: number; ref: { kind: 'unit'; unitId: string } | { kind: 'villager'; villagerId: string } } | null = null;

    for (const unit of this.scene.cowboyUnits) {
      if (!this.scene.isCowboyUnitAlive(unit)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, unit.image.x, unit.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { x: unit.image.x, y: unit.image.y, ref: { kind: 'unit', unitId: unit.id } };
      }
    }

    for (const villager of this.villagers) {
      if (villager.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, villager.image.x, villager.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { x: villager.image.x, y: villager.image.y, ref: { kind: 'villager', villagerId: villager.id } };
      }
    }

    return best;
  }

  /** Applies a hunting/attacking wildlife creature's per-tick bite to whichever prey kind it locked onto. */
  private applyWildlifeDamage(
    ref: { kind: 'unit'; unitId: string } | { kind: 'villager'; villagerId: string },
    damage: number,
  ): void {
    if (ref.kind === 'unit') {
      const unit = this.scene.cowboyUnits.find((candidate: CombatUnit) => candidate.id === ref.unitId);
      if (!unit || !this.scene.isCowboyUnitAlive(unit)) {
        return;
      }
      const remaining = damageUnit(unit.barracksId, unit.kind, unit.index, damage);
      if (remaining <= 0) {
        this.scene.killUnit(unit);
      }
      return;
    }

    const villager = this.villagers.find((candidate) => candidate.id === ref.villagerId);
    if (!villager || villager.hp <= 0) {
      return;
    }
    villager.hp = Math.max(0, villager.hp - damage);
    if (villager.hp <= 0) {
      this.killVillager(villager);
    }
  }

  /** One-shot tween toward the nearest map edge point; despawns the creature on arrival rather than looping. */
  private startWildlifeFlee(creature: Wildlife): void {
    if (creature.state === 'fleeing') {
      return;
    }
    creature.state = 'fleeing';
    creature.targetRef = null;
    this.scene.tweens.killTweensOf(creature.image);

    const edgePoint = this.nearestMapEdgePoint(creature.image.x, creature.image.y);
    const distance = Phaser.Math.Distance.Between(creature.image.x, creature.image.y, edgePoint.x, edgePoint.y);
    const duration = (distance / WILDLIFE_FLEE_SPEED_PX_PER_SEC) * 1000;
    creature.image.setFlipX(edgePoint.x < creature.image.x);

    creature.moveTween = this.scene.tweens.add({
      targets: creature.image,
      x: edgePoint.x,
      y: edgePoint.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        creature.hp = 0;
      },
    });
  }

  /** Closest of the 4 map edges from a world point, clamped to bounds - the flee destination. */
  private nearestMapEdgePoint(x: number, y: number): { x: number; y: number } {
    const mapWidthPx = MAP_WIDTH_TILES * TILE_SIZE;
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE;
    const distances = [
      { x, y: 0, distance: y },
      { x, y: mapHeightPx, distance: mapHeightPx - y },
      { x: 0, y, distance: x },
      { x: mapWidthPx, y, distance: mapWidthPx - x },
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return { x: distances[0].x, y: distances[0].y };
  }

  private removeDeadWildlife(): void {
    const survivors: Wildlife[] = [];
    for (const creature of this.wildlife) {
      if (creature.hp > 0) {
        survivors.push(creature);
        continue;
      }
      this.scene.tweens.killTweensOf(creature.image);
      creature.image.destroy();
    }
    this.wildlife = survivors;
  }

  /** Nearest live wildlife creature to a world point within WILDLIFE_ATTACK_HIT_RADIUS_PX, or null - mirrors findRaiderAt/findCampAt for the right-click attack-order hit-test chain. */
  findWildlifeAt(worldX: number, worldY: number): Wildlife | null {
    let best: Wildlife | null = null;
    let bestDistance = WILDLIFE_ATTACK_HIT_RADIUS_PX;

    for (const creature of this.wildlife) {
      if (creature.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(worldX, worldY, creature.image.x, creature.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = creature;
      }
    }

    return best;
  }

  findNearestWildlife(x: number, y: number, maxDistance: number): Wildlife | null {
    let best: Wildlife | null = null;
    let bestDistance = maxDistance;

    for (const creature of this.wildlife) {
      if (creature.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, creature.image.x, creature.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = creature;
      }
    }

    return best;
  }

  /** Cancels the pending spawn timer and clears every live creature, mirroring resetRaidState/resetMerchantState's exact reset-and-reschedule shape. */
  resetWildlifeState(): void {
    this.wildlifeCheckTimer?.remove();
    this.wildlifeCheckTimer = null;

    for (const creature of this.wildlife) {
      this.scene.tweens.killTweensOf(creature.image);
      creature.image.destroy();
    }
    this.wildlife = [];
    this.mountainLionNotified = false;

    this.scheduleNextWildlifeCheck();
  }

  // ---------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------

  /** Called from MainScene's 'game-reset' handler - villagers and goods carts (not wildlife, which has its own resetWildlifeState mirroring resetRaidState/resetMerchantState's separate reset-and-reschedule call). */
  resetForGameReset(): void {
    for (const villager of this.villagers) {
      this.scene.tweens.killTweensOf(villager.image);
      villager.image.destroy();
    }
    this.villagers = [];

    for (const cart of this.activeCarts) {
      this.scene.tweens.killTweensOf(cart);
      cart.destroy();
    }
    this.activeCarts = [];
  }
}
