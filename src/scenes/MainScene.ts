import Phaser from 'phaser';
import {
  BRAWLER_DAMAGE,
  BRAWLER_MAX_HP,
  BRAWLER_MAX_PER_BARRACKS,
  BRAWLER_RANGE_TILES,
  BRAWLER_WALK_SPEED_PX_PER_SEC,
  CATTLE_DISEASE_DURATION_MAX_SECONDS,
  CATTLE_DISEASE_DURATION_MIN_SECONDS,
  COWBOY_DAMAGE,
  COWBOY_MAX_HP,
  COWBOY_MAX_PER_BARRACKS,
  COWBOY_RANGE_TILES,
  CULL_MARGIN_PX,
  CULL_THROTTLE_MS,
  DAY_PHASE_SECONDS,
  DROUGHT_DURATION_MAX_SECONDS,
  DROUGHT_DURATION_MIN_SECONDS,
  DUST_STORM_DURATION_MAX_SECONDS,
  DUST_STORM_DURATION_MIN_SECONDS,
  DYNAMITER_DAMAGE,
  DYNAMITER_MAX_HP,
  DYNAMITER_RANGE_TILES,
  DYNAMITER_SPLASH_DAMAGE,
  DYNAMITER_SPLASH_RADIUS_TILES,
  DYNAMITER_WALK_SPEED_PX_PER_SEC,
  GOLD_RUSH_DURATION_MAX_SECONDS,
  GOLD_RUSH_DURATION_MIN_SECONDS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MERCHANT_DEAL_MAX_SECONDS,
  MERCHANT_DEAL_MIN_SECONDS,
  MERCHANT_MAX_INTERVAL_MS,
  MERCHANT_MIN_INTERVAL_MS,
  MERCHANT_MULTIPLIER_MAX,
  MERCHANT_MULTIPLIER_MIN,
  MOUNTED_COWBOY_MAX_HP,
  MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC,
  PRODUCTION_TICK_MS,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  WATCHTOWER_DAMAGE,
  WATCHTOWER_RANGE_TILES,
  WORLD_EVENT_BANNER_DURATION_MS,
  WORLD_EVENT_MAX_INTERVAL_MS,
  WORLD_EVENT_MIN_INTERVAL_MS,
} from '../config/constants';
import { TileType, getWorldTiles } from '../config/mapConfig';
import { NightOverlay } from '../ui/NightOverlay';
import { ResourceHudPanel } from '../ui/ResourceHudPanel';
import { TILESET_KEY } from './BootScene';
import {
  BRAWLERS_ATLAS_KEY,
  BRAWLER_TEXTURE_KEY,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingType,
  COWBOYS_ATLAS_KEY,
  COWBOY_SPRITE_SIZE,
  COWBOY_TEXTURE_KEY,
  DYNAMITERS_ATLAS_KEY,
  DYNAMITER_TEXTURE_KEY,
  MARKETABLE_RESOURCE_KEYS,
  MOUNTED_COWBOYS_ATLAS_KEY,
  MOUNTED_COWBOY_SPRITE_HEIGHT,
  MOUNTED_COWBOY_SPRITE_WIDTH,
  MOUNTED_COWBOY_TEXTURE_KEY,
  PlacedBuilding,
  RAIDER_CAMP_SPRITE_SIZE,
  RESOURCE_LABELS,
  UnitKind,
  ANIMAL_SPRITE_SIZE,
  buildingTextureKey,
  getFactionUnitDamageMultiplier,
  getUnitHpArray,
} from '../config/buildingConfig';
import {
  installAudioUnlock,
  playWorldSound,
  setAudioGameSpeed,
  setAudioListenerRect,
} from '../audio/sound';
import { BuildingRemovedPayload, HouseTierChangePayload, gameEvents } from '../state/gameEvents';
import { addNotification } from '../state/notifications';
import { startMerchantDeal } from '../state/market';
import { AUTOSAVE_SLOT, saveToSlot } from '../state/persistence';
import { RaiderCamp, getRaiderCampById, getRaiderCamps } from '../state/raiderCamps';
import {
  DurationWorldEventType,
  WORLD_EVENT_LABELS,
  getActiveWorldEvent,
  pickRandomWorldEventType,
  startWorldEvent,
} from '../state/worldEvents';
import {
  DayPhase,
  DayPhaseChange,
  applyWanderingSettlersReward,
  computeNetWorth,
  destroyBuilding,
  getBuildingById,
  getDayNumber,
  getDayPhase,
  getElapsedSeconds,
  getPlacedBuildings,
  isGameOver,
  runProductionTick,
  tickTimer,
} from '../state/gameState';
import { DustStormOverlay } from '../ui/DustStormOverlay';
import { Raider, RaidSystem } from './systems/RaidSystem';
import { AmbientLifeSystem, Wildlife } from './systems/AmbientLifeSystem';
import { WorldVisualsSystem } from './systems/WorldVisualsSystem';
import { InputSystem } from './systems/InputSystem';
import { MinimapSystem } from './systems/MinimapSystem';

/**
 * Phase 55: Random World Events. Per-type duration range (seconds) and
 * flavor text, kept in MainScene alongside the raid/merchant announcement
 * strings rather than in state/worldEvents.ts - that module's own doc comment
 * explains it deliberately stays free of scene-facing copy/UI concerns,
 * mirroring how RAIDER_DEFINITIONS' labels vs. showRaidNotice's phrasing are
 * split today.
 */
const WORLD_EVENT_DURATION_RANGE_SECONDS: Record<DurationWorldEventType, readonly [number, number]> = {
  drought: [DROUGHT_DURATION_MIN_SECONDS, DROUGHT_DURATION_MAX_SECONDS],
  goldRush: [GOLD_RUSH_DURATION_MIN_SECONDS, GOLD_RUSH_DURATION_MAX_SECONDS],
  cattleDisease: [CATTLE_DISEASE_DURATION_MIN_SECONDS, CATTLE_DISEASE_DURATION_MAX_SECONDS],
  dustStorm: [DUST_STORM_DURATION_MIN_SECONDS, DUST_STORM_DURATION_MAX_SECONDS],
};

const WORLD_EVENT_DESCRIPTIONS: Record<DurationWorldEventType, string> = {
  drought: 'Wells run low.',
  goldRush: 'Sell prices are spiking.',
  cattleDisease: 'Livestock output is down.',
  dustStorm: 'Production is dampened and visibility is poor.',
};

const WORLD_EVENT_NOTIFICATION_KIND: Record<DurationWorldEventType, 'warning' | 'info'> = {
  drought: 'warning',
  goldRush: 'info',
  cattleDisease: 'warning',
  dustStorm: 'warning',
};

/** Phase 31: destruction animation - shake, fade, and a burst of dust motes. */
const DESTRUCTION_SHAKE_PX = 4;
const DESTRUCTION_SHAKE_MS = 60;
const DESTRUCTION_SHAKE_REPEATS = 5;
const DESTRUCTION_FADE_MS = 450;
const DUST_PUFF_COUNT = 10;
const DUST_PUFF_RADIUS_MIN = 2;
const DUST_PUFF_RADIUS_MAX = 5;
const DUST_PUFF_COLOR = 0xbfa980;
const DUST_PUFF_SPREAD_PX = 26;
const DUST_PUFF_DURATION_MIN_MS = 400;
const DUST_PUFF_DURATION_MAX_MS = 800;
const DUST_DEPTH = 14;

const ANIMAL_SPRITE_DEPTH = 11;

/** Garrisoned Cowboys (Phase 22) share the animal sprites' depth/layer - both are static ground props next to a building. */
const COWBOY_SPRITE_DEPTH = ANIMAL_SPRITE_DEPTH;
const COWBOY_SLOT_GAP = 2;
const COWBOY_SLOT_STEP = COWBOY_SPRITE_SIZE + COWBOY_SLOT_GAP;

/**
 * Phase 28: Cowboy-on-Horse shares the Cowboy's static-prop depth band but
 * needs its own slot-step pair (not COWBOY_SLOT_STEP) since its sprite frame
 * is wider/shorter than the square COWBOY_SPRITE_SIZE - separate X/Y steps
 * (rather than one square step) keep the spawn-slot grid from overlapping.
 */
const MOUNTED_COWBOY_SPRITE_DEPTH = COWBOY_SPRITE_DEPTH;
const MOUNTED_COWBOY_SLOT_GAP = 2;
const MOUNTED_COWBOY_SLOT_STEP_X = MOUNTED_COWBOY_SPRITE_WIDTH + MOUNTED_COWBOY_SLOT_GAP;
const MOUNTED_COWBOY_SLOT_STEP_Y = MOUNTED_COWBOY_SPRITE_HEIGHT + MOUNTED_COWBOY_SLOT_GAP;

/** Above villagers (12); HP bars sit topmost of the per-building layers so damage is always visible. */
const HP_BAR_DEPTH = 13;
const HP_BAR_BG_COLOR = 0x2b1d12;
const HP_BAR_FILL_COLOR = 0x4caf50;
const HP_BAR_EMPTY_COLOR = 0xd32f2f;
/**
 * Phase 40: unit HP bars (Cowboy/Cowboy-on-Horse/Raider) share the exact
 * fill/background palette and depth as building HP bars above, but get their
 * own smaller width/height and a separate shared Graphics object
 * (unitHpBarGraphics) - a 12-16px unit sprite can't fit a building-width bar,
 * and keeping the two loops (buildingVisuals vs cowboyUnits+raiders) apart is
 * simpler than branching one draw call on "what kind of thing is this".
 */
const UNIT_HP_BAR_WIDTH = 14;
const UNIT_HP_BAR_HEIGHT = 3;
const UNIT_HP_BAR_MARGIN_ABOVE_PX = 2;
/**
 * Half-height of every small-unit sprite class (animals/villagers/Cowboys/
 * mounted Cowboys/raiders all share ANIMAL_SPRITE_SIZE's height band), used
 * to lift the bar clear of the sprite regardless of unit kind. Phase 75:
 * derived from ANIMAL_SPRITE_SIZE (18) instead of a hardcoded 6 (half of the
 * old 12px), so this stays correct automatically if the size constant ever
 * changes again. Cowboy-on-Horse's taller MOUNTED_COWBOY_SPRITE_HEIGHT (18)
 * happens to match this same half-height (9) at the current 4:3 ratio, so it
 * uses this default too rather than needing its own override.
 */
const UNIT_SPRITE_HALF_HEIGHT_PX = ANIMAL_SPRITE_SIZE / 2;

/**
 * Phase 57: Raider Camps render at the same depth band as buildings (10)
 * rather than the small-unit band (12) - the same z-order convention a real
 * building would use, just without ever entering buildingVisuals/gameState's
 * PlacedBuilding list. Half-height used to push a camp's own HP bar clear of
 * its (bigger-than-a-unit) footprint.
 */
const RAIDER_CAMP_SPRITE_HALF_HEIGHT_PX = RAIDER_CAMP_SPRITE_SIZE / 2;
const COWBOY_SHOT_DEPTH = 13.5;
const COWBOY_SHOT_COLOR = 0xffee58;
const COWBOY_SHOT_FADE_MS = 200;

/** Phase 24: Cowboys are player-directed units. Selection ring stays on MainScene since redrawSelectionRing/killUnit/removeUnitsOfBuilding (combat/cleanup code that also isn't moving) all read it. */
const COWBOY_WALK_SPEED_PX_PER_SEC = 60;
const COWBOY_SELECTION_RING_RADIUS_PX = 10;
const COWBOY_SELECTION_RING_COLOR = 0x42a5f5;

/**
 * Phase 34 night polish. The window light and campfire tween durations moved
 * to WorldVisualsSystem along with the accent-creation code they configure;
 * this constant survives only because setupDayNightCycle passes it through to
 * WorldVisualsSystem.fadeNightAccents's durationMs parameter.
 */
const NIGHT_ACCENT_FADE_MS = 4000;

/**
 * Phase 34 combat audio. Above this many cowboys firing in one combat tick,
 * a single "volley" voice is played instead of N gunshots - see
 * playCombatVolley.
 */
const VOLLEY_SHOT_THRESHOLD = 4;
const GUNSHOT_MAX_STAGGER_MS = 150;
/** Footstep ticks are only emitted for selected units, and no more often than this globally. */
const FOOTSTEP_INTERVAL_MS = 320;
/** Per-animal ambient call scheduling; each animal picks a fresh delay in this range every time. */
const ANIMAL_SOUND_MIN_DELAY_MS = 6000;
const ANIMAL_SOUND_MAX_DELAY_MS = 16000;

/**
 * Phase 24: a Cowboy is now an independently-positioned, player-directed unit
 * rather than a position purely derived from its Barracks + slot index (Phase
 * 22). It still remembers which Barracks trained it and which cowboyHp slot
 * is "its" HP (gameState.ts stays the single source of truth for HP, same
 * pattern raiders use for building.hp), but its on-screen position is now its
 * own live image.x/y, which can drift away from that slot via a move order.
 * Tracked at scene level (mirroring Raider[] above) rather than inside
 * BuildingVisual, since a Cowboy is no longer owned by its Barracks' visual
 * once it can walk away from it.
 *
 * Named generically (Phase 25) rather than `CowboyUnit`: selection and
 * movement no longer assume a single unit kind, since Phase 28 adds a second
 * player-directed unit (Cowboy on Horse) that plugs into this same
 * selection/move system without needing its own parallel type.
 */
/**
 * Phase 28: the discriminant that lets a single CombatUnit type/tracking
 * array/selection system serve every unit kind (Phase 58 adds Brawler/
 * Dynamiter to the original Cowboy/Cowboy-on-Horse pair - the type itself now
 * lives in buildingConfig.ts, shared with PlacedBuilding's per-kind field
 * pairs and TrainingQueueJob.kind, rather than being redeclared here). Kept
 * as a plain string union plus one small lookup table (UNIT_KIND_CONFIG
 * below) rather than a generic "unit type registry" class.
 *
 * Phase 58: range/damage/splash are now genuinely per-kind too (previously
 * only walk speed/max HP varied - Cowboy and Cowboy-on-Horse fought
 * identically). This table is the "counters actually exist" core of the
 * phase: every combat call site below reads a unit's range/damage from here
 * instead of the old bare COWBOY_RANGE_TILES/COWBOY_DAMAGE constants, so a
 * Brawler's melee range and a Dynamiter's splash are genuine per-unit
 * properties rather than a single shared rule with two exceptions bolted on.
 */
interface UnitKindConfig {
  walkSpeedPxPerSec: number;
  maxHp: number;
  rangeTiles: number;
  damage: number;
  /** Dynamiter only: every other live raider/camp within this many tiles of the primary target also takes splashDamage (scaled by that target's own faction multiplier), on top of the primary hit. */
  splashRadiusTiles?: number;
  splashDamage?: number;
}

/** Phase 87: exported - InputSystem's issueUnitMoveOrder reads walkSpeedPxPerSec for the road-speed-bonus calculation. */
export const UNIT_KIND_CONFIG: Record<UnitKind, UnitKindConfig> = {
  cowboy: {
    walkSpeedPxPerSec: COWBOY_WALK_SPEED_PX_PER_SEC,
    maxHp: COWBOY_MAX_HP,
    rangeTiles: COWBOY_RANGE_TILES,
    damage: COWBOY_DAMAGE,
  },
  // Cowboy on Horse keeps the plain Cowboy's exact firepower (range/damage) -
  // only speed/HP differ, per the original Phase 28 design - so it reuses the
  // same constants rather than declaring its own equal-but-separate ones.
  cowboyOnHorse: {
    walkSpeedPxPerSec: MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC,
    maxHp: MOUNTED_COWBOY_MAX_HP,
    rangeTiles: COWBOY_RANGE_TILES,
    damage: COWBOY_DAMAGE,
  },
  brawler: {
    walkSpeedPxPerSec: BRAWLER_WALK_SPEED_PX_PER_SEC,
    maxHp: BRAWLER_MAX_HP,
    rangeTiles: BRAWLER_RANGE_TILES,
    damage: BRAWLER_DAMAGE,
  },
  dynamiter: {
    walkSpeedPxPerSec: DYNAMITER_WALK_SPEED_PX_PER_SEC,
    maxHp: DYNAMITER_MAX_HP,
    rangeTiles: DYNAMITER_RANGE_TILES,
    damage: DYNAMITER_DAMAGE,
    splashRadiusTiles: DYNAMITER_SPLASH_RADIUS_TILES,
    splashDamage: DYNAMITER_SPLASH_DAMAGE,
  },
};

/**
 * Phase 58: per-kind sprite/atlas lookup so a single spawnUnitOfKind can
 * create any of the four kinds instead of two near-duplicate
 * spawnCowboyUnit/spawnMountedCowboyUnit functions. Brawler/Dynamiter share
 * Cowboy's square small-unit depth band (COWBOY_SPRITE_DEPTH); only
 * Cowboy-on-Horse's non-square frame needs its own slot-layout function
 * (getMountedCowboySlotPosition) - the other three share
 * getSquareUnitSlotPosition.
 */
interface UnitVisualConfig {
  atlasKey: string;
  textureKey: string;
  depth: number;
}

const UNIT_VISUAL_CONFIG: Record<UnitKind, UnitVisualConfig> = {
  cowboy: { atlasKey: COWBOYS_ATLAS_KEY, textureKey: COWBOY_TEXTURE_KEY, depth: COWBOY_SPRITE_DEPTH },
  cowboyOnHorse: {
    atlasKey: MOUNTED_COWBOYS_ATLAS_KEY,
    textureKey: MOUNTED_COWBOY_TEXTURE_KEY,
    depth: MOUNTED_COWBOY_SPRITE_DEPTH,
  },
  brawler: { atlasKey: BRAWLERS_ATLAS_KEY, textureKey: BRAWLER_TEXTURE_KEY, depth: COWBOY_SPRITE_DEPTH },
  dynamiter: { atlasKey: DYNAMITERS_ATLAS_KEY, textureKey: DYNAMITER_TEXTURE_KEY, depth: COWBOY_SPRITE_DEPTH },
};

/**
 * Phase 58: a Barracks now trains three kinds sharing one square slot grid
 * (getSquareUnitSlotPosition) - without an offset, a building's first-trained
 * Brawler would render on top of its first-trained Cowboy (both "index 0").
 * Reserves a fixed block of slots per kind, sized to that kind's own
 * per-Barracks cap, so slots never collide regardless of training order.
 * Cowboy-on-Horse isn't listed - Horsery only ever trains that one kind, so
 * its slot index never needs an offset.
 */
const UNIT_KIND_SLOT_OFFSET: Partial<Record<UnitKind, number>> = {
  cowboy: 0,
  brawler: COWBOY_MAX_PER_BARRACKS,
  dynamiter: COWBOY_MAX_PER_BARRACKS + BRAWLER_MAX_PER_BARRACKS,
};

/**
 * Phase 57: generalizes what used to be a bare `attackTargetRaiderId: string
 * | null` into a small discriminated ref so a standing attack order can name
 * either a Raider or a RaiderCamp by id - both are looked up fresh every tick
 * (through getAttackTargetPosition) rather than holding a live object
 * reference, exactly like the raider-only version did.
 *
 * Phase 71: widened to also name a Wildlife creature by id - a player can
 * right-click a Snake/Coyote/Mountain Lion just like a raider/camp, resolved
 * through the same getAttackTargetPosition/resolveUnitFireTarget union.
 */
/** Phase 87: exported - InputSystem's issueUnitAttackOrder constructs these when resolving a right-click onto a raider/camp/wildlife. */
export interface AttackTargetRef {
  kind: 'raider' | 'camp' | 'wildlife';
  id: string;
}

export interface CombatUnit {
  /** Phase 41: stable identity for control groups (Map<number, string[]>) and double-click-select-all, surviving this.cowboyUnits' own churn the same way Raider.id does. */
  id: string;
  image: Phaser.GameObjects.Image;
  barracksId: string;
  index: number;
  moveTween: Phaser.Tweens.Tween | null;
  kind: UnitKind;
  /**
   * Phase 40: an explicit attack order (issueUnitAttackOrder) on a specific
   * raider or (Phase 57) Raider Camp. While set, this unit's combat-tick
   * behavior (resolveUnitAttackOrders/resolveCowboyFire) locks onto that one
   * target - approaching into range and then focus-firing it every tick -
   * instead of the default "auto-fire at whichever raider is nearest" rule
   * (which never auto-targets a camp; only an explicit order does). Cleared
   * the moment the ordered target is no longer found alive (dead/destroyed,
   * or the wave ended) so the unit falls back to auto-targeting raiders on
   * its own, and also cleared by any new plain move order
   * (issueUnitMoveOrders), since that's an explicit new command superseding
   * the standing attack order.
   */
  attackTarget: AttackTargetRef | null;
}

export class MainScene extends Phaser.Scene {
  /**
   * Phase 63: a second, zoom-locked camera that renders the HUD/overlay band
   * and nothing else. setScrollFactor(0) only cancels a camera's scroll on an
   * object's position - it does NOT exempt it from camera.setZoom(), which
   * scales the whole display list that camera draws. So before this existed,
   * wheel-zooming the world also scaled the resource panel, minimap, timer,
   * notice banners and the night/dust-storm tints along with it.
   *
   * The split is enforced by registerUiObject: the main camera ignores every
   * UI object, this camera ignores everything else, and its zoom is never
   * touched by setupCameraZoom.
   */
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  /**
   * Every GameObject handed to registerUiObject - i.e. the full HUD roster.
   * Not read by the render path (the split is carried per-object in
   * cameraFilter); kept as the one enumerable answer to "what is on the UI
   * camera", which is otherwise scattered across a dozen setup methods.
   */
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  /** Phase 87: non-private - MinimapSystem.setup() reads getBottomY() to lay out the minimap just below this panel. */
  resourceHud!: ResourceHudPanel;
  private timerText!: Phaser.GameObjects.Text;
  private gameSpeed = 1;
  /**
   * Phase 85: MainScene Decomposition Part 1 - Raids & Combat. Owns raid
   * scheduling/lifecycle, raider spawning/targeting/wall-detour pathing, the
   * raid-only slice of combat resolution, and Raider Camps (Phase 57).
   * Constructed once in create(); see systems/RaidSystem.ts's own doc comment
   * for exactly what stayed on MainScene (the shooter-resolution functions
   * that are fused with Hostile Wildlife combat) and why.
   */
  /** Phase 86: non-private - WorldVisualsSystem/AmbientLifeSystem call back into RaidSystem (pickRaidSpawnPoint, sampleForBlockingWall, damageCamp, etc.) through this.scene.raidSystem. */
  raidSystem!: RaidSystem;
  /**
   * Phase 86: MainScene Decomposition Part 2 - World Visuals. Owns building/
   * animal/accent/vegetation visual creation, fence/connection/chain-view
   * lines, building HP bars, status badges, harvest-radius/Church-service
   * rings, and the enclosure debug overlay/exit-hint arrow. Constructed once
   * in create(); see systems/WorldVisualsSystem.ts's own doc comment.
   */
  worldVisualsSystem!: WorldVisualsSystem;
  /**
   * Phase 86: MainScene Decomposition Part 2 - Ambient Life. Owns villagers,
   * goods carts, and Hostile Wildlife (spawning, wandering, roam/hunt/attack/
   * flee). Constructed once in create(); see systems/AmbientLifeSystem.ts's
   * own doc comment.
   */
  ambientLifeSystem!: AmbientLifeSystem;
  /**
   * Phase 87: MainScene Decomposition Part 3 - Input. Owns camera drag/zoom/
   * keyboard pan, touch gestures, hotkeys, unit selection/box-select/move-
   * attack-order issuance, building placement mode, demolish mode, and
   * rally-point picking. Constructed once in create(); see
   * systems/InputSystem.ts's own doc comment for exactly what deliberately
   * stayed on MainScene (selectedUnits/cowboyUnits/the combat-tick half of
   * attack-order resolution) and why.
   */
  inputSystem!: InputSystem;
  /**
   * Phase 87: MainScene Decomposition Part 3 - Minimap. Owns minimap terrain/
   * building-dot rendering, the throttled camera-viewport rectangle,
   * throttled combat-dot rendering, building-damage flash pings, off-screen-
   * threat pings, and minimap click/drag-to-navigate hit-testing. Constructed
   * once in create(); see systems/MinimapSystem.ts's own doc comment.
   */
  minimapSystem!: MinimapSystem;
  /** Tracked so a building that is destroyed/demolished while its info panel is open closes that panel. */
  /** Phase 86: non-private - WorldVisualsSystem.redrawHarvestRing() reads the currently-selected building. */
  selectedBuildingId: string | null = null;
  private phaseRemainingDisplay = DAY_PHASE_SECONDS;
  /** Phase 86: non-private - WorldVisualsSystem.createNightAccents() reads the overlay's live alpha to match a freshly-placed building's night accents to the current darkness. */
  nightOverlay!: NightOverlay;
  private lastFootstepAt = 0;
  private animalSoundTimer: Phaser.Time.TimerEvent | null = null;
  /** Phase 86: non-private - WorldVisualsSystem.redrawHarvestRing() reads the currently-selected placement type for its placement-preview ring. */
  selectedType: BuildingType | null = null;
  /** Phase 51: Traveling Merchant - self-rescheduling timer mirroring raidCheckTimer, but with no wave/active-state to gate on. */
  private merchantCheckTimer: Phaser.Time.TimerEvent | null = null;
  /** Phase 55: Random World Events - self-rescheduling timer mirroring merchantCheckTimer. */
  private worldEventCheckTimer: Phaser.Time.TimerEvent | null = null;
  private worldEventNoticeText!: Phaser.GameObjects.Text;
  private worldEventNoticeHideTimer: Phaser.Time.TimerEvent | null = null;
  /**
   * Phase 52: which day number the autosave last fired for, so the
   * 'day-phase-changed' listener only saves once per genuine dawn rather than
   * on resetGame's own synthetic "Day 1, day" event (fired at elapsedSeconds
   * 0, which this is guarded against separately) or a repeat delivery of the
   * same boundary. Reset to -1 on 'game-reset' so a new run's real Day 1 dawn
   * isn't skipped for matching a previous run's already-saved day number.
   */
  private lastAutosaveDayNumber = -1;
  /** Phase 52: set by the 'game-loaded' handler, consumed by the very next 'day-phase-changed' (deserializeGameState re-emits one right after 'game-loaded' to refresh the HUD with the loaded phase) so a load never immediately re-triggers the autosave it may itself have just been restored from. */
  private suppressNextAutosaveCheck = false;
  /** Phase 85: non-private - RaidSystem clears this array's tweens/objects during resetRaidState. */
  cowboyShotGraphics: Phaser.GameObjects.Graphics[] = [];
  /**
   * Phase 85: non-private - RaidSystem reads live units when resolving raid
   * attacks and clearing camp attack orders. Phase 87: also read/written by
   * InputSystem (selection, box-select, control groups, move/attack orders)
   * via this.scene.cowboyUnits - kept on MainScene rather than moved since
   * killUnit/removeUnitsOfBuilding/combat-tick resolution (all staying here)
   * touch it too; see InputSystem.ts's own doc comment.
   */
  cowboyUnits: CombatUnit[] = [];
  /** Phase 41: monotonically increasing so every CombatUnit.id is unique for the life of the scene, mirroring raiderIdCounter. */
  private unitIdCounter = 0;
  /** Phase 87: non-private - InputSystem owns selection (selectUnitAt/selectUnitsInRect/control groups/issueUnitMoveOrders/etc.) and reads/writes this via this.scene.selectedUnits; killUnit/removeUnitsOfBuilding/setupGameOverHalt (staying on MainScene) also touch it, which is why the field itself didn't move - see InputSystem.ts's own doc comment. */
  selectedUnits: CombatUnit[] = [];
  /** Phase 87: non-private - InputSystem's setupUnitControl creates this (this.scene.selectionRingGraphics = ...); redrawSelectionRing (called every frame from update()) stays on MainScene since it reads this alongside selectedUnits, and killUnit/removeUnitsOfBuilding/setupGameOverHalt (also staying) clear it too. */
  selectionRingGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 87: non-private - InputSystem's selectUnitAt/selectUnitsInRect/handleNumberKey/cycleIdleUnitSelection toggle this via this.scene.cowboySelectionHintText; killUnit/removeUnitsOfBuilding/setupGameOverHalt (staying on MainScene) also touch it. */
  cowboySelectionHintText!: Phaser.GameObjects.Text;
  /** Phase 40: separate shared Graphics object for Cowboy/Cowboy-on-Horse/Raider HP bars, mirroring WorldVisualsSystem's building hpBarGraphics' one-Graphics-per-tick-redraw discipline rather than a GameObject per unit. */
  private unitHpBarGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 87: non-private - MinimapSystem reads terrain colors off this for the minimap's terrain layer. */
  tileData: TileType[][] = [];
  /** Phase 84: stored so 'game-reset' can repaint every tile from a freshly regenerated map (see resetGame's new regenerateWorldTiles call) without rebuilding the whole Tilemap/layer object. */
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  /** Phase 82: Viewport Culling - throttle timestamp for updateViewportCulling, following redrawMinimapCombatThrottled's exact pattern. */
  private lastCullUpdate = 0;

  constructor() {
    super('MainScene');
  }

  create(): void {
    // Phase 65: touch/tablet controls. Phaser defaults to a single active
    // touch pointer (mousePointer + pointer1); a two-finger pinch/pan gesture
    // needs a second concurrently-tracked pointer to exist at all. Must run
    // before setupTouchGestures (and is harmless before everything else -
    // addPointer only allocates pointer slots, it registers no listeners).
    this.input.addPointer(2);

    // Must run before anything that calls registerUiObject (setupInfoText
    // onward); buildTilemap/worldVisualsSystem.setupVegetationVisuals create
    // world-only objects and are unaffected by ordering here.
    this.setupUiCamera();
    this.buildTilemap();
    // Phase 86: MainScene Decomposition Part 2. RaidSystem is constructed
    // ahead of these two (unchanged from Phase 85) since AmbientLifeSystem's
    // wildlife hunting AI reaches into it (pickRaidSpawnPoint,
    // sampleForBlockingWall) via this.scene.raidSystem the moment it's set up.
    this.raidSystem = new RaidSystem(this);
    this.worldVisualsSystem = new WorldVisualsSystem(this);
    this.ambientLifeSystem = new AmbientLifeSystem(this);
    // Phase 87: MainScene Decomposition Part 3. Constructed after the other
    // three systems - InputSystem/MinimapSystem's own methods reach into
    // raidSystem/worldVisualsSystem/ambientLifeSystem via this.scene.xxx
    // late-binding (matching every other cross-system reference in this
    // codebase), so as long as all five fields are assigned before any
    // setup method actually RUNS (not merely before it's constructed), the
    // exact construction order among these five doesn't matter - only that
    // it happens before the first setup call below.
    this.inputSystem = new InputSystem(this);
    this.minimapSystem = new MinimapSystem(this);
    this.worldVisualsSystem.setupVegetationVisuals();
    this.inputSystem.setupCameraDrag();
    this.inputSystem.setupCameraZoom();
    this.inputSystem.setupTouchGestures();
    this.inputSystem.setupKeyboardCamera();
    this.inputSystem.setupInfoText();
    this.setupResourceHud();
    this.setupTimerHud();
    this.setupSpeedControl();
    this.minimapSystem.setup();
    this.inputSystem.setupBuildingPlacement();
    this.inputSystem.setupDemolishMode();
    this.setupBuildingRemoval();
    this.inputSystem.setupBuildingSelection();
    this.setupProductionTimer();
    this.worldVisualsSystem.setupConnectionVisuals();
    this.ambientLifeSystem.setupGoodsCarts();
    this.worldVisualsSystem.setupFenceVisuals();
    this.worldVisualsSystem.setupChainView();
    this.setupAnimalVisuals();
    this.setupHouseTierVisuals();
    this.setupGateVisuals();
    this.setupCowboyVisuals();
    this.inputSystem.setupUnitControl();
    this.inputSystem.setupRallyPoints();
    this.inputSystem.setupHotkeys();
    this.worldVisualsSystem.setupHpBarVisuals();
    this.setupUnitHpBarVisuals();
    this.worldVisualsSystem.setupStatusBadges();
    this.worldVisualsSystem.setupHarvestRadiusRing();
    this.worldVisualsSystem.setupEnclosureDebugOverlay();
    this.worldVisualsSystem.setupEnclosureExitHint();
    this.setupDayNightCycle();
    this.setupAudio();
    this.raidSystem.setupRaidSystem();
    this.raidSystem.setupRaiderCamps();
    this.setupMerchantSystem();
    this.setupWorldEventSystem();
    this.ambientLifeSystem.setupWildlifeSystem();
    this.inputSystem.setupNotificationLog();
    this.setupGameOverHalt();
    this.setupGameReset();
    this.setupSaveLoad();
    this.pauseForPreGameSelection();
  }

  update(time: number, delta: number): void {
    this.redrawSelectionRing();
    this.inputSystem.updateKeyboardCameraPan(delta);
    // The audio engine culls/pans world sounds against the camera's current
    // view; pushing it here (rather than reading a scene reference from inside
    // the audio module) keeps that module free of any Phaser dependency.
    setAudioListenerRect(this.cameras.main.worldView);
    this.emitFootstepTicks();
    // Phase 45: unlike buildings (event-driven redraw) or the viewport rect
    // (redrawn on camera-move events), units/raiders drift every frame even
    // while the camera and buildings are untouched - so this is the one
    // minimap redraw driven straight from update(), throttled the same way.
    this.minimapSystem.redrawMinimapCombatThrottled(time);
    // Phase 82: buildings/vegetation/villagers drift in and out of view via
    // camera pan/zoom every frame (not just on placement events), so this
    // needs the same continuous-but-throttled treatment as the minimap combat
    // redraw above.
    this.updateViewportCullingThrottled(time);
  }

  /**
   * Phase 63: creates the zoom-locked HUD camera. It sits above the main
   * camera in the camera list (cameras.add appends), covers the identical
   * viewport rect, and has transparent = true so it composites over the world
   * rather than clearing it.
   *
   * Its scroll stays at 0 and its zoom stays at 1 forever - setupCameraZoom
   * only ever touches cameras.main - which is precisely what makes every
   * object it draws screen-fixed at a constant on-screen size.
   */
  private setupUiCamera(): void {
    this.uiCamera = this.cameras.add(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, false, 'ui');
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);

    // Camera.ignore() is an additive bitmask (cameraFilter |= camera.id) with
    // no un-ignore counterpart, so the split has to be applied to each object
    // exactly once, in the right direction, and never "recomputed".
    //
    // World objects vastly outnumber HUD ones and are created continuously
    // (buildings, units, raiders, vegetation, tweened one-shots like dust
    // puffs and shot lines), so opting each of them out of the UI camera by
    // hand at ~40 creation sites would be a standing trap for every future
    // phase that adds one. Instead the default is "world-only", applied here
    // to every object as it enters the display list; registerUiObject is the
    // explicit opt-out for the handful of HUD objects, which flip to
    // "UI-only" before this listener ever sees them.
    this.events.on(
      Phaser.Scenes.Events.ADDED_TO_SCENE,
      (object: Phaser.GameObjects.GameObject) => {
        this.uiCamera.ignore(object);
      },
    );
  }

  /**
   * Phase 63: marks a GameObject as HUD-only - drawn by the zoom-locked UI
   * camera and ignored by the world camera, so camera.setZoom() can never
   * scale it.
   *
   * Must be called for every screen-fixed object: setScrollFactor(0) alone
   * only pins position, and an object that skips this stays on the main
   * camera and will visibly scale with wheel zoom (the bug this fixes).
   */
  /** Phase 85: non-private - RaidSystem.setupRaidSystem() registers the raid notice text as a HUD object. */
  registerUiObject(
    ...objects: (Phaser.GameObjects.GameObject | undefined | null)[]
  ): void {
    for (const object of objects) {
      if (!object) {
        continue;
      }
      this.uiObjects.push(object);
      this.cameras.main.ignore(object);
      // The ADDED_TO_SCENE listener above already ran for this object (it
      // fires synchronously inside scene.add.*, before this call), marking it
      // world-only by default. Phaser has no un-ignore method - ignore() only
      // ORs the camera's id into cameraFilter - so clearing that one bit here
      // is what promotes the object from "world default" to "UI-only".
      object.cameraFilter &= ~this.uiCamera.id;
    }
  }

  private buildTilemap(): void {
    const map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: MAP_WIDTH_TILES,
      height: MAP_HEIGHT_TILES,
    });

    const tileset = map.addTilesetImage('tiles', TILESET_KEY, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) {
      throw new Error('Failed to load tileset image');
    }

    const layer = map.createBlankLayer('ground', tileset, 0, 0);
    if (!layer) {
      throw new Error('Failed to create ground layer');
    }

    this.groundLayer = layer;
    this.redrawGroundLayer();

    this.cameras.main.setBounds(0, 0, MAP_WIDTH_TILES * TILE_SIZE, MAP_HEIGHT_TILES * TILE_SIZE);
  }

  /**
   * Phase 84: repaints every tile from mapConfig's current getWorldTiles() -
   * shared by buildTilemap()'s initial paint and the new 'game-reset' redraw
   * (resetGame now calls regenerateWorldTiles() on every reset, including a
   * voluntary "Establish a New Town" cash-out, so the visible map must be
   * repainted to match rather than silently keeping the old grid's tiles).
   * Map dimensions/tile size are constant, so no Tilemap/layer/camera-bounds
   * rebuild is needed - only the per-tile data changes.
   */
  private redrawGroundLayer(): void {
    // Phase 30: the terrain grid is owned by mapConfig (gameState consults it
    // on every placement check), so the scene reads it rather than generating
    // its own copy.
    const tileData = getWorldTiles();
    this.tileData = tileData.map((row) => [...row]);
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        this.groundLayer.putTileAt(tileData[y][x], x, y);
      }
    }
  }

  private setupResourceHud(): void {
    this.resourceHud = new ResourceHudPanel(this);
    this.registerUiObject(...this.resourceHud.getUiObjects());

    gameEvents.on('money-changed', () => this.resourceHud.refresh());
    gameEvents.on('resources-changed', () => this.resourceHud.refresh());
    gameEvents.on('production-tick', () => this.resourceHud.refresh());
  }

  /**
   * Raid combat resolution rides the same 2s cadence as production instead of
   * its own timer: it's already the game's "slow tick" for anything that
   * shouldn't run per-frame, and running it right after production means a
   * building's HP regen (inside runProductionTick) and that tick's raider
   * damage are both settled before the HP bars redraw.
   */
  private setupProductionTimer(): void {
    this.time.addEvent({
      delay: PRODUCTION_TICK_MS,
      loop: true,
      callback: () => {
        // Phase 34: the explicit pause/game-over guard setupSpeedControl's
        // comment used to *claim* lived inside runProductionTick. It didn't -
        // runProductionTick only ever early-returned on gameOver, never on
        // pause. In practice time.timeScale = 0 stops this timer from firing
        // at all, so the bug was latent rather than visible, but a guard that
        // is documented to exist should exist.
        if (this.gameSpeed === 0 || isGameOver()) {
          return;
        }
        runProductionTick();
        this.runRaidCombatTick();
      },
    });
  }

  /**
   * Phase 33: pause and 1x/2x/4x fast-forward. Rather than rescaling every
   * individual timer and tween by hand, this drives Phaser's two global
   * time scales: this.time.timeScale (every TimerEvent - production ticks,
   * the countdown clock, raid scheduling) and this.tweens.timeScale (every
   * movement/animation tween - villagers, units, raiders, accents). A speed
   * of 0 freezes both, which is exactly what "paused" means here: production
   * ticks stop firing and raids neither spawn nor advance.
   *
   * Phase 34: the production timer's own callback additionally checks
   * gameSpeed/isGameOver, so a timer that fires mid-transition can't advance
   * the simulation (this comment previously described that guard as living
   * inside runProductionTick, where it did not in fact exist).
   */
  private setupSpeedControl(): void {
    gameEvents.on('speed-changed', (speed: number) => {
      this.gameSpeed = speed;
      this.time.timeScale = speed;
      this.tweens.timeScale = speed;
      // Paused means silent; faster speeds deliberately do NOT get a matching
      // increase in sound trigger rate beyond what the sped-up timers already
      // cause (see the audio module's header).
      setAudioGameSpeed(speed);
      this.timerText.setText(this.formatTimerText());
    });
  }

  private setupTimerHud(): void {
    this.timerText = this.add.text(VIEWPORT_WIDTH - 8, 8, this.formatTimerText(), {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
      align: 'right',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setScrollFactor(0);
    this.timerText.setDepth(1000);
    this.registerUiObject(this.timerText);

    gameEvents.on('timer-changed', (phaseRemainingSeconds: number) => {
      this.phaseRemainingDisplay = phaseRemainingSeconds;
      this.timerText.setText(this.formatTimerText());
    });
    gameEvents.on('production-tick', () => {
      this.timerText.setText(this.formatTimerText());
    });

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => tickTimer(),
    });
  }

  /**
   * Phase 32: the headline number is net worth, not meat. Also shows the
   * current speed multiplier (or PAUSED) so the player always knows why the
   * clock is or isn't moving.
   *
   * Phase 34: the flat run countdown is replaced by the cycle position -
   * which day, which half of it, and how long that half has left. "How long
   * until the run ends" is no longer the number the player plans around;
   * "how long until nightfall (and therefore raids)" is.
   */
  private formatTimerText(): string {
    const minutes = Math.floor(this.phaseRemainingDisplay / 60);
    const seconds = this.phaseRemainingDisplay % 60;
    const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    // "Day 2 - Day 1:40" read as a typo in testing; the phase gets the longer
    // word so the day counter and the phase can't be mistaken for each other.
    const phaseLabel = getDayPhase() === 'night' ? 'Night' : 'Daytime';
    const speedLabel = this.gameSpeed === 0 ? 'PAUSED' : `${this.gameSpeed}x`;
    return `Day ${getDayNumber()} - ${phaseLabel} ${time} (${speedLabel}) | Net worth: $${computeNetWorth().total}`;
  }

  /**
   * Phase 82: Viewport Culling. Throttled to CULL_THROTTLE_MS (same value/
   * pattern as MINIMAP_VIEWPORT_THROTTLE_MS's own throttle-and-redraw pair)
   * since it needs to react to continuous camera pan/zoom, not just discrete
   * placement/load/reset events - those events instead call
   * updateViewportCulling directly (unthrottled) so a freshly created sprite
   * is never left in the wrong visibility state for up to a throttle window.
   */
  private updateViewportCullingThrottled(now: number): void {
    if (now - this.lastCullUpdate < CULL_THROTTLE_MS) {
      return;
    }
    this.lastCullUpdate = now;
    this.updateViewportCulling();
  }

  /**
   * Sets .setVisible() on every building/animal/accent sprite, vegetation
   * sprite and villager sprite based on whether it intersects the camera's
   * current worldView (already zoom-aware - see redrawMinimapViewport's own
   * comment on this), expanded by CULL_MARGIN_PX on every side so a sprite
   * doesn't visibly pop in/out right at the screen edge during a pan, and so
   * a multi-tile building anchored at its top-left origin isn't hidden while
   * a corner of it is still genuinely on-screen.
   *
   * Purely a render-cost cut: every one of these sprites keeps existing,
   * keeps its tweens running (a known, accepted limitation - see CLAUDE.md),
   * and keeps being read by every other system exactly as before. Nothing
   * outside this method and its throttled wrapper may ever read `.visible`
   * off any of these three collections as a game-logic signal.
   */
  /** Phase 87: non-private - InputSystem's placeBuildingAt calls this right after creating a fresh building's visual (including the far end of a drag-placed line), same as before. */
  updateViewportCulling(): void {
    const view = this.cameras.main.worldView;
    const left = view.x - CULL_MARGIN_PX;
    const top = view.y - CULL_MARGIN_PX;
    const right = view.right + CULL_MARGIN_PX;
    const bottom = view.bottom + CULL_MARGIN_PX;

    for (const visual of this.worldVisualsSystem.buildingVisuals.values()) {
      const { width, height } = BUILDING_DEFINITIONS[visual.building.type].size;
      const buildingLeft = visual.building.tileX * TILE_SIZE;
      const buildingTop = visual.building.tileY * TILE_SIZE;
      const buildingRight = buildingLeft + width * TILE_SIZE;
      const buildingBottom = buildingTop + height * TILE_SIZE;
      const isVisible =
        buildingRight >= left && buildingLeft <= right && buildingBottom >= top && buildingTop <= bottom;

      visual.image.setVisible(isVisible);
      for (const animalImage of visual.animalImages) {
        animalImage.setVisible(isVisible);
      }
      for (const accentObject of visual.accentObjects) {
        // accentObjects mixes Image and Arc (House's smoke puffs) - both
        // implement Phaser's Visible component (setVisible), unlike the bare
        // GameObject base type the array is declared as.
        (accentObject as unknown as Phaser.GameObjects.Components.Visible).setVisible(isVisible);
      }
    }

    for (const image of this.worldVisualsSystem.vegetationImages.values()) {
      const isVisible = image.x >= left && image.x <= right && image.y >= top && image.y <= bottom;
      image.setVisible(isVisible);
    }

    for (const villager of this.ambientLifeSystem.villagers) {
      const isVisible =
        villager.image.x >= left && villager.image.x <= right && villager.image.y >= top && villager.image.y <= bottom;
      villager.image.setVisible(isVisible);
    }
  }

  /**
   * Phase 31: single cleanup path for a building leaving the world, whether
   * it was destroyed by raiders or bulldozed by the player. gameState has
   * already dropped it from its own records by the time this runs, so
   * everything here is purely visual/scene-local: its sprite (plus the
   * destruction animation for a raid kill), its animals, its idle accents,
   * and any units it trained - a garrison dies with its Barracks.
   */
  private setupBuildingRemoval(): void {
    gameEvents.on('building-removed', ({ building, reason }: BuildingRemovedPayload) => {
      const visual = this.worldVisualsSystem.buildingVisuals.get(building.id);
      if (visual) {
        this.worldVisualsSystem.buildingVisuals.delete(building.id);

        for (const animalImage of visual.animalImages) {
          this.tweens.killTweensOf(animalImage);
          animalImage.destroy();
        }
        for (const accentObject of visual.accentObjects) {
          this.tweens.killTweensOf(accentObject);
          accentObject.destroy();
        }

        if (reason === 'destroyed') {
          this.playDestructionAnimation(visual.image, building);
        } else {
          this.tweens.killTweensOf(visual.image);
          visual.image.destroy();
        }
      }

      this.removeUnitsOfBuilding(building.id);
      if (building.type === BuildingType.House) {
        this.ambientLifeSystem.removeVillagersForLostHouse();
      }

      if (this.selectedBuildingId === building.id) {
        gameEvents.emit('building-selected', null);
      }

      this.worldVisualsSystem.redrawConnectionOutlines();
      this.worldVisualsSystem.redrawFenceLines();
      this.worldVisualsSystem.redrawHpBars();
      this.minimapSystem.redrawMinimap();
    });
  }

  /**
   * Shake, fade, and a puff of dust. The sprite is already detached from
   * buildingVisuals (and from gameState) when this runs, so it's a pure
   * orphan being animated to its own destruction - nothing else can look it
   * up mid-animation. Follows the same killTweensOf-then-destroy discipline
   * the animal/accent cleanup uses, so no tween ever outlives its target.
   */
  private playDestructionAnimation(image: Phaser.GameObjects.Image, building: PlacedBuilding): void {
    const originX = image.x;

    this.tweens.add({
      targets: image,
      x: originX + DESTRUCTION_SHAKE_PX,
      duration: DESTRUCTION_SHAKE_MS,
      yoyo: true,
      repeat: DESTRUCTION_SHAKE_REPEATS,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: image,
      alpha: 0,
      duration: DESTRUCTION_FADE_MS,
      delay: DESTRUCTION_SHAKE_MS * (DESTRUCTION_SHAKE_REPEATS + 1),
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.tweens.killTweensOf(image);
        image.destroy();
      },
    });

    this.spawnDustBurst(building);
  }

  private spawnDustBurst(building: PlacedBuilding): void {
    const center = this.tileCenter(building);
    this.spawnDustBurstAt(center.x, center.y);
  }

  /** Extracted from spawnDustBurst (Phase 57) so Raider Camp destruction - which has no PlacedBuilding/tileCenter to read a footprint from - can reuse the same dust-motes burst at a plain world point. */
  /** Phase 85: non-private - RaidSystem.destroyRaiderCamp() reuses this for a camp's destruction burst. */
  spawnDustBurstAt(centerX: number, centerY: number): void {
    const center = { x: centerX, y: centerY };

    for (let index = 0; index < DUST_PUFF_COUNT; index++) {
      const radius = Phaser.Math.Between(DUST_PUFF_RADIUS_MIN, DUST_PUFF_RADIUS_MAX);
      const puff = this.add
        .circle(center.x, center.y, radius, DUST_PUFF_COLOR, 0.7)
        .setDepth(DUST_DEPTH);

      this.tweens.add({
        targets: puff,
        x: center.x + Phaser.Math.Between(-DUST_PUFF_SPREAD_PX, DUST_PUFF_SPREAD_PX),
        y: center.y + Phaser.Math.Between(-DUST_PUFF_SPREAD_PX, DUST_PUFF_SPREAD_PX),
        alpha: 0,
        scale: 1.6,
        duration: Phaser.Math.Between(DUST_PUFF_DURATION_MIN_MS, DUST_PUFF_DURATION_MAX_MS),
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.killTweensOf(puff);
          puff.destroy();
        },
      });
    }
  }

  /** Units are owned by the building that trained them, so they go when it does. */
  private removeUnitsOfBuilding(buildingId: string): void {
    const survivors: CombatUnit[] = [];
    for (const unit of this.cowboyUnits) {
      if (unit.barracksId !== buildingId) {
        survivors.push(unit);
        continue;
      }
      unit.moveTween?.stop();
      this.tweens.killTweensOf(unit.image);
      unit.image.destroy();
    }
    this.cowboyUnits = survivors;
    this.selectedUnits = this.selectedUnits.filter((unit) => unit.barracksId !== buildingId);
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /** Phase 86: split off from the old setupHpBarVisuals - building HP bars (hpBarGraphics/redrawHpBars) moved to WorldVisualsSystem; this keeps just the unit/raider/camp half, which is fused with combat state and stays here. */
  private setupUnitHpBarVisuals(): void {
    this.unitHpBarGraphics = this.add.graphics();
    this.unitHpBarGraphics.setDepth(HP_BAR_DEPTH);

    // Phase 40: unit HP doesn't regenerate, so this only ever needs to react
    // to combat (runRaidCombatTick already calls it directly after damage is
    // applied) - but it's also hooked to the same production-tick cadence as
    // the building bars so a unit trained/healed mid-tick still reads
    // correctly even outside an active raid.
    gameEvents.on('production-tick', () => this.redrawUnitHpBars());
  }

  /**
   * Phase 40: one shared Graphics object for every live Cowboy/Cowboy-on-Horse
   * and every live raider, redrawn wholesale each call - same discipline as
   * WorldVisualsSystem's building redrawHpBars, just iterating cowboyUnits/
   * raiders instead of buildingVisuals. Player units hide their bar at full
   * HP (matching the building convention); raiders always show theirs since
   * they're transient, combat-only entities where "how close is this one to
   * dying" is useful at a glance even at full health. Phase 57: every live
   * Raider Camp gets the same always-shown treatment as a raider - it's a
   * standing objective the player is actively expected to whittle down.
   */
  private redrawUnitHpBars(): void {
    this.unitHpBarGraphics.clear();

    for (const unit of this.cowboyUnits) {
      const hp = this.getUnitHp(unit);
      if (hp === null) {
        continue;
      }
      const maxHp = UNIT_KIND_CONFIG[unit.kind].maxHp;
      if (hp >= maxHp) {
        continue;
      }
      this.drawUnitHpBar(unit.image.x, unit.image.y, hp, maxHp);
    }

    for (const raider of this.raidSystem.raiders) {
      if (raider.hp <= 0) {
        continue;
      }
      this.drawUnitHpBar(raider.image.x, raider.image.y, raider.hp, raider.maxHp);
    }

    for (const camp of getRaiderCamps()) {
      this.drawUnitHpBar(camp.x, camp.y, camp.hp, camp.maxHp, RAIDER_CAMP_SPRITE_HALF_HEIGHT_PX);
    }
  }

  /** Reads a unit's live HP straight out of its owning building's parallel HP array - gameState stays the single source of truth for unit HP, same pattern isCowboyUnitAlive already uses. */
  private getUnitHp(unit: CombatUnit): number | null {
    const building = getBuildingById(unit.barracksId);
    if (!building) {
      return null;
    }
    return getUnitHpArray(building, unit.kind)[unit.index] ?? null;
  }

  /**
   * Same two-fill-rect background/fill technique as redrawHpBars, just
   * centered on a unit's live x/y instead of anchored to a building's tile
   * footprint. `spriteHalfHeightPx` (Phase 57) defaults to a small unit's
   * half-height but lets a bigger sprite (a Raider Camp) push its bar up far
   * enough to clear its own footprint.
   */
  private drawUnitHpBar(
    centerX: number,
    centerY: number,
    hp: number,
    maxHp: number,
    spriteHalfHeightPx: number = UNIT_SPRITE_HALF_HEIGHT_PX,
  ): void {
    const px = centerX - UNIT_HP_BAR_WIDTH / 2;
    const py = centerY - spriteHalfHeightPx - UNIT_HP_BAR_MARGIN_ABOVE_PX - UNIT_HP_BAR_HEIGHT;
    const ratio = Math.max(0, hp / maxHp);

    this.unitHpBarGraphics.fillStyle(HP_BAR_BG_COLOR, 1);
    this.unitHpBarGraphics.fillRect(px, py, UNIT_HP_BAR_WIDTH, UNIT_HP_BAR_HEIGHT);
    this.unitHpBarGraphics.fillStyle(ratio > 0 ? HP_BAR_FILL_COLOR : HP_BAR_EMPTY_COLOR, 1);
    this.unitHpBarGraphics.fillRect(px, py, UNIT_HP_BAR_WIDTH * ratio, UNIT_HP_BAR_HEIGHT);
  }

  /**
   * Phase 34: the day/night cycle's visual side. The cycle itself is state
   * (gameState owns dayNumber/phase/elapsed and emits 'day-phase-changed');
   * this only reacts to it - darken the screen, light the windows, cool the
   * vegetation, and announce the transition.
   */
  private setupDayNightCycle(): void {
    this.nightOverlay = new NightOverlay(this);
    this.registerUiObject(...this.nightOverlay.getUiObjects());
    this.worldVisualsSystem.applyVegetationTint(getDayPhase());

    gameEvents.on('day-phase-changed', ({ dayNumber, phase }: DayPhaseChange) => {
      this.worldVisualsSystem.applyVegetationTint(phase);
      this.worldVisualsSystem.fadeNightAccents(phase, NIGHT_ACCENT_FADE_MS);
      this.timerText.setText(this.formatTimerText());
      this.showPhaseNotice(dayNumber, phase);
      // Phase 71: top decorative villager sprites back up toward VILLAGER_CAP
      // every dawn, reusing this existing hook rather than a new timer - see
      // topUpVillagersOnDawn's own doc comment for why this never touches
      // real population.
      if (phase === 'day') {
        this.ambientLifeSystem.topUpVillagersOnDawn();
      }
    });
  }

  /**
   * Reuses the raid notice's slot/style rather than adding a third HUD text
   * object; suppressed while a raid is on screen, which is strictly the more
   * urgent message (and raids only happen at night, so this would otherwise
   * fight with them at exactly the wrong moment).
   */
  private showPhaseNotice(dayNumber: number, phase: DayPhase): void {
    if (this.raidSystem.raidActive) {
      return;
    }
    this.raidSystem.raidNoticeText.setText(
      phase === 'night' ? `Night falls - Day ${dayNumber}` : `Sunrise - Day ${dayNumber}`,
    );
    this.raidSystem.raidNoticeText.setVisible(true);
    this.time.delayedCall(4000, () => {
      if (!this.raidSystem.raidActive) {
        this.raidSystem.raidNoticeText.setVisible(false);
      }
    });
  }

  /**
   * Phase 34: audio wiring. The engine itself (src/audio/sound.ts) is
   * scene-agnostic; this is the only place that knows both where things are
   * in the world and what just happened to them.
   */
  private setupAudio(): void {
    installAudioUnlock();
    setAudioGameSpeed(this.gameSpeed);

    gameEvents.on('building-removed', ({ building, reason }: BuildingRemovedPayload) => {
      const center = this.tileCenter(building);
      playWorldSound(reason === 'destroyed' ? 'buildingCollapse' : 'clear', center.x, center.y);
    });

    this.scheduleAnimalSounds();
    gameEvents.on('game-reset', () => this.scheduleAnimalSounds());
  }

  /**
   * Phase 34 animal ambience. One shared self-rescheduling timer picks ONE
   * on-screen animal per firing rather than every animal owning its own timer:
   * a full town can hold 30+ critters, and 30 independent timers would both
   * cost more and (far worse) all try to play at once. The engine's own
   * per-sound minGapMs is the final backstop.
   */
  private scheduleAnimalSounds(): void {
    this.animalSoundTimer?.remove();
    const delay = Phaser.Math.Between(ANIMAL_SOUND_MIN_DELAY_MS, ANIMAL_SOUND_MAX_DELAY_MS);

    this.animalSoundTimer = this.time.delayedCall(delay, () => {
      this.playRandomAnimalSound();
      this.scheduleAnimalSounds();
    });
  }

  private playRandomAnimalSound(): void {
    const candidates: { x: number; y: number; sound: 'animalChicken' | 'animalPig' | 'animalCow' }[] = [];
    const worldView = this.cameras.main.worldView;

    for (const visual of this.worldVisualsSystem.buildingVisuals.values()) {
      const animalConfig = BUILDING_DEFINITIONS[visual.building.type].animal;
      if (!animalConfig || visual.animalImages.length === 0) {
        continue;
      }
      const sound =
        animalConfig.animalLabel === 'Chicken'
          ? 'animalChicken'
          : animalConfig.animalLabel === 'Pig'
            ? 'animalPig'
            : 'animalCow';

      for (const image of visual.animalImages) {
        // Cheap pre-cull so the random pick can't keep landing on off-screen
        // animals and producing silence (the engine would drop them anyway).
        if (worldView.contains(image.x, image.y)) {
          candidates.push({ x: image.x, y: image.y, sound });
        }
      }
    }

    if (candidates.length === 0) {
      return;
    }
    const pick = candidates[Phaser.Math.Between(0, candidates.length - 1)];
    playWorldSound(pick.sound, pick.x, pick.y);
  }

  /**
   * Phase 34: footsteps for *selected* units only, and globally throttled.
   * Per-step audio for all ~30 wandering villagers and animals was explicitly
   * ruled out - at that density it stops being footsteps and becomes rain.
   */
  private emitFootstepTicks(): void {
    if (this.selectedUnits.length === 0 || this.gameSpeed === 0) {
      return;
    }
    if (this.time.now - this.lastFootstepAt < FOOTSTEP_INTERVAL_MS) {
      return;
    }

    const moving = this.selectedUnits.find((unit) => unit.moveTween !== null);
    if (!moving) {
      return;
    }

    this.lastFootstepAt = this.time.now;
    playWorldSound('footstep', moving.image.x, moving.image.y);
  }

  /**
   * Phase 34: N cowboys firing in one combat tick is N shots, and a defended
   * town can field 10-15 shooters. Below VOLLEY_SHOT_THRESHOLD each shot is
   * its own voice with a small random stagger (a perfectly simultaneous
   * volley sounds like a single click); above it the whole exchange collapses
   * into one louder "volley" voice, which is both cheaper and closer to what a
   * line of gunfire actually sounds like.
   */
  private playCombatVolley(shots: { x: number; y: number }[]): void {
    if (shots.length === 0) {
      return;
    }

    if (shots.length >= VOLLEY_SHOT_THRESHOLD) {
      const centerX = shots.reduce((sum, shot) => sum + shot.x, 0) / shots.length;
      const centerY = shots.reduce((sum, shot) => sum + shot.y, 0) / shots.length;
      playWorldSound('volley', centerX, centerY);
      return;
    }

    for (const shot of shots) {
      this.time.delayedCall(Phaser.Math.Between(0, GUNSHOT_MAX_STAGGER_MS), () => {
        playWorldSound('gunshot', shot.x, shot.y);
      });
    }
  }

  /**
   * Phase 34: the world used to keep running behind the game-over screen -
   * raiders went on chewing through buildings, tweens went on tweening, and
   * the final net-worth number on screen could be describing a town that no
   * longer existed. Nothing here touches gameState (which has already frozen
   * itself via its own gameOver flag); this is purely stopping the scene.
   */
  private setupGameOverHalt(): void {
    gameEvents.on('game-over', () => {
      this.raidSystem.haltForGameOver();
      this.merchantCheckTimer?.remove();
      this.merchantCheckTimer = null;
      this.worldEventCheckTimer?.remove();
      this.worldEventCheckTimer = null;
      this.worldEventNoticeHideTimer?.remove();
      this.worldEventNoticeHideTimer = null;
      this.worldEventNoticeText.setVisible(false);
      this.animalSoundTimer?.remove();
      this.animalSoundTimer = null;
      this.raidSystem.raidNoticeText.setVisible(false);

      this.inputSystem.cancelPlacement();
      this.selectedUnits = [];
      this.selectionRingGraphics.clear();
      this.cowboySelectionHintText.setVisible(false);

      // Freezes every remaining timer and tween (villager/animal wander, unit
      // moves, idle accents) in place behind the overlay. resetGame's
      // 'game-reset' handler restores both to the player's chosen speed.
      this.time.timeScale = 0;
      this.tweens.timeScale = 0;
      setAudioGameSpeed(0);
    });
  }

  /**
   * Phase 39: the difficulty/mode picker sits in front of the world before a
   * run starts, and again between a game-over and the next Start click.
   * Reuses setupGameOverHalt's exact pause primitive (time/tween timeScale 0)
   * so nothing - production, the clock, raid scheduling, wander tweens -
   * advances behind it. setupGameReset's existing 'game-reset' handler is
   * what un-pauses this back to this.gameSpeed; DifficultySelectOverlay's
   * Start button calls resetGame(), which fires that same event, so no
   * separate un-pause path is needed for either the first run or a restart.
   */
  private pauseForPreGameSelection(): void {
    this.time.timeScale = 0;
    this.tweens.timeScale = 0;
    setAudioGameSpeed(0);
  }

  /** Phase 85: non-private - RaidSystem's targeting/pathing code (findNearestBuilding, findBlockingWall, findWallDetourPoint, sendRaiderToTarget) reads a target building's world center through this. */
  tileCenter(building: PlacedBuilding): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    return {
      x: building.tileX * TILE_SIZE + (width * TILE_SIZE) / 2,
      y: building.tileY * TILE_SIZE + (height * TILE_SIZE) / 2,
    };
  }

  private setupAnimalVisuals(): void {
    gameEvents.on('animal-bought', (building: PlacedBuilding) => {
      const visual = this.worldVisualsSystem.buildingVisuals.get(building.id);
      if (visual) {
        this.worldVisualsSystem.redrawAnimalSprites(visual);
      }
    });
  }

  /**
   * Phase 46: swaps a House's sprite frame the moment gameState.runHouseNeeds
   * actually flips its tier, plus a small non-audio feedback cue (a scale
   * pulse on upgrade, a brief red tint flash on downgrade) so the change
   * reads as an event rather than a silent texture swap - the same
   * lightweight-tween-only treatment Phase 19's idle accents use, no new
   * sound asset needed for a rare, non-combat event.
   */
  private setupHouseTierVisuals(): void {
    gameEvents.on('house-tier-changed', ({ building, direction }: HouseTierChangePayload) => {
      const visual = this.worldVisualsSystem.buildingVisuals.get(building.id);
      if (!visual) {
        return;
      }

      visual.image.setTexture(BUILDING_ATLAS_KEY, buildingTextureKey(building.type, building.houseTier));

      this.tweens.killTweensOf(visual.image);
      if (direction === 'upgrade') {
        visual.image.setScale(1.25);
        this.tweens.add({ targets: visual.image, scale: 1, duration: 300, ease: 'Back.easeOut' });
      } else {
        visual.image.setTint(0xff8a80);
        this.time.delayedCall(300, () => visual.image.clearTint());
      }
    });
  }

  /**
   * Phase 69: swaps a WoodenGate's sprite frame the moment gameState's
   * setGateOpen/setAllGates actually flips gateOpen - same setTexture-not-
   * destroy/recreate technique as setupHouseTierVisuals above, just without
   * the upgrade/downgrade tween cue (a gate toggle is a deliberate player
   * action, not an emergent event worth a feedback flourish). The enclosure-
   * exit-hint redraw this state change can also require is wired centrally in
   * setupEnclosureExitHint (also listening for 'gate-state-changed'), not
   * here, matching how that method already centralizes every other
   * enclosure-affecting event rather than each building-visual setup method
   * redrawing it individually.
   */
  private setupGateVisuals(): void {
    gameEvents.on('gate-state-changed', (building: PlacedBuilding) => {
      const visual = this.worldVisualsSystem.buildingVisuals.get(building.id);
      if (!visual) {
        return;
      }
      visual.image.setTexture(
        BUILDING_ATLAS_KEY,
        buildingTextureKey(building.type, building.houseTier, building.gateOpen),
      );
    });
  }

  private setupCowboyVisuals(): void {
    // Phase 24: training used to destroy-and-recreate the Barracks' whole cowboy
    // sprite set (redrawCowboySprites), which was harmless while position was
    // purely derived from index. Now that a unit can carry a live position and
    // an in-flight move order, destroying siblings on every train would wipe
    // that out - so every one of these only ever ADDS the one newly trained
    // unit (its slot is always that kind's own hp array length - 1, the index
    // gameState's trainX just pushed).
    gameEvents.on('cowboy-trained', (building: PlacedBuilding) => {
      const unit = this.spawnUnitOfKind(building, 'cowboy', building.cowboyHp.length - 1);
      this.sendUnitToRallyPointIfSet(building, unit);
    });
    gameEvents.on('mounted-cowboy-trained', (building: PlacedBuilding) => {
      const unit = this.spawnUnitOfKind(building, 'cowboyOnHorse', building.mountedCowboyHp.length - 1);
      this.sendUnitToRallyPointIfSet(building, unit);
    });
    // Phase 58: same "only add the newly trained one" rule as the two above.
    gameEvents.on('brawler-trained', (building: PlacedBuilding) => {
      const unit = this.spawnUnitOfKind(building, 'brawler', building.brawlerHp.length - 1);
      this.sendUnitToRallyPointIfSet(building, unit);
    });
    gameEvents.on('dynamiter-trained', (building: PlacedBuilding) => {
      const unit = this.spawnUnitOfKind(building, 'dynamiter', building.dynamiterHp.length - 1);
      this.sendUnitToRallyPointIfSet(building, unit);
    });
  }

  /**
   * Phase 53: only wired to the '*-trained' spawn paths above, deliberately
   * NOT to restoreBuildingVisual's load-time respawn - a loaded save's
   * already-garrisoned units should reappear standing at their slot, not
   * immediately re-march to a rally point on every single load.
   */
  private sendUnitToRallyPointIfSet(building: PlacedBuilding, unit: CombatUnit): void {
    if (building.rallyPoint) {
      this.inputSystem.issueUnitMoveOrder(unit, building.rallyPoint.x, building.rallyPoint.y);
    }
  }

  /**
   * Phase 58: replaces the old spawnCowboyUnit/spawnMountedCowboyUnit pair -
   * a single function driven by UNIT_VISUAL_CONFIG (atlas/texture/depth) and
   * UNIT_KIND_SLOT_OFFSET (so Brawler/Dynamiter don't render on top of a
   * Barracks' Cowboys) rather than two near-duplicate functions plus two more
   * for the two new kinds.
   */
  /** Phase 86: non-private - WorldVisualsSystem.restoreBuildingVisual() re-spawns a loaded save's garrisoned units the same way. */
  spawnUnitOfKind(building: PlacedBuilding, kind: UnitKind, index: number): CombatUnit {
    const visual = UNIT_VISUAL_CONFIG[kind];
    const slot =
      kind === 'cowboyOnHorse'
        ? this.getMountedCowboySlotPosition(building, index)
        : this.getSquareUnitSlotPosition(building, (UNIT_KIND_SLOT_OFFSET[kind] ?? 0) + index);
    const image = this.add.image(slot.x, slot.y, visual.atlasKey, visual.textureKey).setDepth(visual.depth);
    const unit: CombatUnit = {
      id: `unit-${this.unitIdCounter++}`,
      image,
      barracksId: building.id,
      index,
      moveTween: null,
      kind,
      attackTarget: null,
    };
    this.cowboyUnits.push(unit);
    return unit;
  }

  /**
   * Same deterministic row/column slot layout the original Cowboy-only
   * version used (still named after "square" rather than "cowboy" since
   * Phase 58 has three square kinds sharing it now: Cowboy, Brawler,
   * Dynamiter - all COWBOY_SPRITE_SIZE). `slotIndex` is the caller's already
   * kind-offset index (see UNIT_KIND_SLOT_OFFSET), not a raw per-kind index.
   */
  private getSquareUnitSlotPosition(building: PlacedBuilding, slotIndex: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / COWBOY_SLOT_STEP));
    const col = slotIndex % columns;
    const row = Math.floor(slotIndex / columns);

    const rowPxWidth = columns * COWBOY_SLOT_STEP - COWBOY_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + COWBOY_SLOT_STEP / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + COWBOY_SLOT_STEP / 2;

    return {
      x: startX + col * COWBOY_SLOT_STEP,
      y: startY + row * COWBOY_SLOT_STEP,
    };
  }

  /** Same deterministic row/column slot layout as getSquareUnitSlotPosition, but stepped by MOUNTED_COWBOY_SLOT_STEP_X/Y since its sprite frame isn't square. */
  private getMountedCowboySlotPosition(building: PlacedBuilding, index: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / MOUNTED_COWBOY_SLOT_STEP_X));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const rowPxWidth = columns * MOUNTED_COWBOY_SLOT_STEP_X - MOUNTED_COWBOY_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + MOUNTED_COWBOY_SLOT_STEP_X / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + MOUNTED_COWBOY_SLOT_STEP_Y / 2;

    return {
      x: startX + col * MOUNTED_COWBOY_SLOT_STEP_X,
      y: startY + row * MOUNTED_COWBOY_SLOT_STEP_Y,
    };
  }

  /**
   * A unit is combat-eligible/selectable only while both its training
   * building and its own HP slot are alive - dead/destroyed either way, it no
   * longer defends. Phase 58: reads the correct parallel HP array via
   * buildingConfig's getUnitHpArray instead of a two-way kind ternary, now
   * that there are four kinds/arrays to pick from.
   */
  /** Phase 86: non-private - AmbientLifeSystem.findNearestPrey()/applyWildlifeDamage() check unit liveness the same way combat code does. */
  isCowboyUnitAlive(unit: CombatUnit): boolean {
    const building = getBuildingById(unit.barracksId);
    if (!building || building.hp <= 0) {
      return false;
    }
    const hp = getUnitHpArray(building, unit.kind)[unit.index];
    return (hp ?? 0) > 0;
  }

  /**
   * Live world position of a unit's standing attack order, re-resolved fresh
   * every call (never cached) since a raider walks and a camp's hp can hit
   * zero between ticks. Returns null once the ordered target is no longer
   * found alive/existing, which is exactly the signal resolveUnitAttackOrders
   * uses to clear the order and hand the unit back to auto-targeting.
   */
  private getAttackTargetPosition(target: AttackTargetRef): { x: number; y: number } | null {
    if (target.kind === 'raider') {
      const raider = this.raidSystem.raiders.find((candidate) => candidate.id === target.id && candidate.hp > 0);
      return raider ? { x: raider.image.x, y: raider.image.y } : null;
    }
    if (target.kind === 'wildlife') {
      const creature = this.ambientLifeSystem.wildlife.find(
        (candidate) => candidate.id === target.id && candidate.hp > 0,
      );
      return creature ? { x: creature.image.x, y: creature.image.y } : null;
    }
    const camp = getRaiderCampById(target.id);
    return camp && camp.hp > 0 ? { x: camp.x, y: camp.y } : null;
  }

  /**
   * Shared by issueUnitAttackOrder (immediate feedback the moment the order is
   * given) and resolveUnitAttackOrders (the per-combat-tick refresh): if the
   * unit is already within its own kind's range (UNIT_KIND_CONFIG, Phase 58 -
   * a Brawler needs to walk to melee range 1, a Dynamiter can hold much
   * farther back) of the target position, stop closing the distance and hold
   * position so resolveCowboyFire can start focus-firing it; otherwise
   * (re)issue a move order toward it. Generalized (Phase 57) from a
   * Raider-only version to a plain {x,y} since neither a raider's live
   * position nor a camp's static one need any other field here.
   */
  /** Phase 87: non-private - InputSystem's issueUnitAttackOrder calls this via this.scene.approachOrEngageTarget for the immediate approach-or-hold feedback the instant an attack order is given. */
  approachOrEngageTarget(unit: CombatUnit, position: { x: number; y: number }): void {
    const rangePx = UNIT_KIND_CONFIG[unit.kind].rangeTiles * TILE_SIZE;
    const distance = Phaser.Math.Distance.Between(unit.image.x, unit.image.y, position.x, position.y);
    if (distance <= rangePx) {
      unit.moveTween?.stop();
      unit.moveTween = null;
      return;
    }
    this.inputSystem.issueUnitMoveOrder(unit, position.x, position.y);
  }

  /** Redrawn every frame (update()) rather than on an event, since it must visually track units mid-move-tween; cheap at this unit count. One ring per selected unit (Phase 25). */
  private redrawSelectionRing(): void {
    this.selectionRingGraphics.clear();
    if (this.selectedUnits.length === 0) {
      return;
    }
    this.selectionRingGraphics.lineStyle(2, COWBOY_SELECTION_RING_COLOR, 1);
    for (const unit of this.selectedUnits) {
      this.selectionRingGraphics.strokeCircle(unit.image.x, unit.image.y, COWBOY_SELECTION_RING_RADIUS_PX);
    }
  }

  private setupGameReset(): void {
    gameEvents.on('game-reset', () => {
      // Phase 87: bundles cancelPlacement + control-group/click-tracking
      // clears + selectionRectGraphics.clear() - see InputSystem's
      // resetForGameReset's own doc comment (rally-point cleanup is handled
      // by setupRallyPoints' own independent 'game-reset' listener, not this
      // one, same as before Phase 87). Pure state/graphics clearing with no
      // gameEvents emitted, so bundling it here (rather than spreading it
      // across this handler at the exact same relative points the
      // pre-Phase-87 inline code had it) is behavior-equivalent - nothing
      // else in this handler reads placement/selection-rect state mid-reset.
      this.inputSystem.resetForGameReset();
      gameEvents.emit('building-selected', null);

      // Phase 84: resetGame() now reseeds a fresh map on every reset
      // (regenerateWorldTiles), so the visible ground layer has to be
      // repainted to match - otherwise the player would keep seeing the
      // previous town's terrain even though gameState's placement checks are
      // already validating against the new one.
      this.redrawGroundLayer();

      // Phase 86: building/animal/accent/vegetation visuals, fence/connection/
      // chain-view lines, building HP bars, status badges and the harvest/
      // enclosure overlays are all torn down together by WorldVisualsSystem's
      // own reset (also re-emits 'resource-selected'/null and rebuilds
      // vegetation, matching this handler's prior inline order exactly).
      this.worldVisualsSystem.resetForGameReset();
      this.unitHpBarGraphics.clear();

      // Phase 34: setupGameOverHalt froze the scene's clocks behind the
      // game-over screen; Play Again is the one path back, so it restores
      // them to the speed the player had selected.
      this.time.timeScale = this.gameSpeed;
      this.tweens.timeScale = this.gameSpeed;
      setAudioGameSpeed(this.gameSpeed);

      // Phase 86: villagers and goods carts are AmbientLifeSystem's own
      // tracked collections now.
      this.ambientLifeSystem.resetForGameReset();

      for (const unit of this.cowboyUnits) {
        unit.moveTween?.stop();
        unit.image.destroy();
      }
      this.cowboyUnits = [];
      this.selectedUnits = [];
      this.selectionRingGraphics.clear();
      this.cowboySelectionHintText.setVisible(false);

      this.raidSystem.resetRaiderCampVisuals();
      this.minimapSystem.redrawMinimap();

      this.raidSystem.resetRaidState();
      this.resetMerchantState();
      this.resetWorldEventState();
      this.ambientLifeSystem.resetWildlifeState();
      this.lastAutosaveDayNumber = -1;

      // Phase 82: buildingVisuals is empty and vegetation/villagers were just
      // rebuilt above - re-run the cull pass immediately so a fresh run
      // starts with every new sprite in the correct visibility state rather
      // than waiting for the next throttled update() tick.
      this.updateViewportCulling();
    });
  }

  /**
   * Phase 52: Save/Load + Autosave's scene-side half. state/persistence.ts
   * owns the actual (de)serialization and localStorage plumbing; this only
   * reacts to its 'game-loaded' event (rebuilding every building/villager/
   * garrisoned-unit visual from the now-populated gameState, mirroring how
   * setupGameReset tears them down) and drives the once-per-dawn autosave off
   * the existing day/night clock.
   */
  private setupSaveLoad(): void {
    gameEvents.on('game-loaded', () => {
      this.worldVisualsSystem.redrawAllVegetation();
      for (const building of getPlacedBuildings()) {
        this.worldVisualsSystem.restoreBuildingVisual(building);
      }
      // Phase 57: a loaded save's Raider Camps are real persisted state (see
      // persistence.ts) - restore their sprites the same way. Whether the
      // day-2 initial spawn should still be considered "pending" depends on
      // the loaded day number, not merely on whether any camp currently
      // exists: a save from before RAIDER_CAMP_SPAWN_DAY should still spawn
      // camps once that day naturally arrives during continued play, while a
      // later save with 0 camps (every one already destroyed) must not have
      // them respawn just because it was reloaded.
      this.raidSystem.restoreCampVisuals();
      this.raidSystem.notifyLoadedDayNumber(getDayNumber());
      this.minimapSystem.redrawMinimap();
      this.suppressNextAutosaveCheck = true;
      // Phase 82: every restored building/vegetation/villager sprite now
      // exists (redrawAllVegetation/restoreBuildingVisual above) - cull them
      // immediately rather than waiting for the next throttled update() tick.
      this.updateViewportCulling();
    });

    gameEvents.on('day-phase-changed', ({ dayNumber, phase }: DayPhaseChange) => {
      if (this.suppressNextAutosaveCheck) {
        this.suppressNextAutosaveCheck = false;
        return;
      }
      // getElapsedSeconds() > 0 excludes resetGame's own synthetic "Day 1,
      // day" event, always fired at elapsedSeconds 0 for a brand new run -
      // not a real dawn worth autosaving.
      if (phase === 'day' && dayNumber !== this.lastAutosaveDayNumber && getElapsedSeconds() > 0) {
        this.lastAutosaveDayNumber = dayNumber;
        saveToSlot(AUTOSAVE_SLOT);
        addNotification('Autosaved.', 'info', getElapsedSeconds());
      }
    });
  }

  /**
   * Phase 51: Traveling Merchant. Follows scheduleNextRaidCheck's exact
   * self-rescheduling shape (roll a random delay, fire, immediately roll the
   * next one) but with none of the raid system's active-wave/eligibility
   * gating - a merchant deal has no "wave" to avoid overlapping and no grace
   * period, so the timer body is just "fire, then reschedule".
   */
  private setupMerchantSystem(): void {
    this.scheduleNextMerchantCheck();
  }

  private scheduleNextMerchantCheck(): void {
    const delay = Phaser.Math.Between(MERCHANT_MIN_INTERVAL_MS, MERCHANT_MAX_INTERVAL_MS);
    this.merchantCheckTimer = this.time.delayedCall(delay, () => {
      this.triggerMerchantDeal();
      this.scheduleNextMerchantCheck();
    });
  }

  /**
   * Picks one marketable resource and a random price-spike multiplier/
   * duration, hands it to state/market.ts (the single source of truth for
   * currentMarketPrice) and announces it through Phase 44's notification log
   * - no bespoke UI chrome, the HUD tooltip's price/arrow already reflects it
   * live once startMerchantDeal takes effect on the next production tick.
   */
  private triggerMerchantDeal(): void {
    const key = MARKETABLE_RESOURCE_KEYS[Phaser.Math.Between(0, MARKETABLE_RESOURCE_KEYS.length - 1)];
    const multiplier = Phaser.Math.FloatBetween(MERCHANT_MULTIPLIER_MIN, MERCHANT_MULTIPLIER_MAX);
    const durationSeconds = Phaser.Math.Between(MERCHANT_DEAL_MIN_SECONDS, MERCHANT_DEAL_MAX_SECONDS);

    startMerchantDeal(key, multiplier, durationSeconds, getElapsedSeconds());

    const percentUp = Math.round((multiplier - 1) * 100);
    addNotification(
      `Traveling merchant wants ${RESOURCE_LABELS[key]}! Price up ${percentUp}% for the next ${durationSeconds}s.`,
      'info',
      getElapsedSeconds(),
    );
  }

  /** Mirrors resetRaidState: cancel the pending check and start a fresh one so a new run doesn't inherit the previous run's countdown. */
  private resetMerchantState(): void {
    this.merchantCheckTimer?.remove();
    this.merchantCheckTimer = null;
    this.scheduleNextMerchantCheck();
  }

  /**
   * Phase 55: Random World Events. Follows scheduleNextRaidCheck/
   * scheduleNextMerchantCheck's exact self-rescheduling shape (roll a random
   * delay, fire, immediately roll the next one), widened past the merchant
   * timer's 90-180s window (WORLD_EVENT_MIN/MAX_INTERVAL_MS = 120-200s) so the
   * two timers don't habitually land on top of each other.
   *
   * The banner text is a separate GameObject from raidNoticeText - a raid
   * warning and a world-event announcement can legitimately be visible at the
   * same time, and sharing one Text would make one silently clobber the
   * other.
   */
  private setupWorldEventSystem(): void {
    // Self-contained widget (owns its own gameEvents subscriptions/lifecycle,
    // same as NightOverlay) - no method on it is ever called again after
    // construction, so it still isn't kept as a field; the local exists only
    // to hand its rect to the UI camera (Phase 63).
    const dustStormOverlay = new DustStormOverlay(this);
    this.registerUiObject(...dustStormOverlay.getUiObjects());

    this.worldEventNoticeText = this.add.text(VIEWPORT_WIDTH / 2, 68, '', {
      fontSize: '18px',
      color: '#ffd699',
      backgroundColor: '#2b1d12cc',
      padding: { x: 10, y: 6 },
    });
    this.worldEventNoticeText.setOrigin(0.5, 0);
    this.worldEventNoticeText.setScrollFactor(0);
    this.worldEventNoticeText.setDepth(1000);
    this.worldEventNoticeText.setVisible(false);
    this.registerUiObject(this.worldEventNoticeText);

    this.scheduleNextWorldEventCheck();
  }

  private scheduleNextWorldEventCheck(): void {
    const delay = Phaser.Math.Between(WORLD_EVENT_MIN_INTERVAL_MS, WORLD_EVENT_MAX_INTERVAL_MS);
    this.worldEventCheckTimer = this.time.delayedCall(delay, () => {
      this.triggerWorldEvent();
      this.scheduleNextWorldEventCheck();
    });
  }

  /**
   * state/worldEvents.ts only ever tracks one active duration-based event at
   * a time (see its own doc comment) - a roll that lands while one is still
   * running is simply skipped rather than queued, exactly like a raid check
   * that fires while a wave is already active. wanderingSettlers is the
   * exception: it's an instant reward with no ongoing state, so it always
   * fires regardless of whether another event is currently active.
   */
  private triggerWorldEvent(): void {
    const type = pickRandomWorldEventType();

    if (type === 'wanderingSettlers') {
      const amount = applyWanderingSettlersReward();
      const message = `Wandering settlers pass through and leave $${amount} in thanks for your hospitality!`;
      this.showWorldEventNotice(message);
      addNotification(message, 'info', getElapsedSeconds());
      return;
    }

    if (getActiveWorldEvent()) {
      return;
    }

    const [durationMin, durationMax] = WORLD_EVENT_DURATION_RANGE_SECONDS[type];
    const durationSeconds = Phaser.Math.Between(durationMin, durationMax);
    startWorldEvent(type, durationSeconds, getElapsedSeconds());

    const message = `${WORLD_EVENT_LABELS[type]}! ${WORLD_EVENT_DESCRIPTIONS[type]} (${durationSeconds}s)`;
    this.showWorldEventNotice(message);
    addNotification(message, WORLD_EVENT_NOTIFICATION_KIND[type], getElapsedSeconds());
  }

  /** Mirrors showRaidNotice's on-screen-then-auto-hide behavior, but on its own timer/text object. */
  private showWorldEventNotice(message: string): void {
    this.worldEventNoticeHideTimer?.remove();
    this.worldEventNoticeText.setText(message);
    this.worldEventNoticeText.setVisible(true);
    this.worldEventNoticeHideTimer = this.time.delayedCall(WORLD_EVENT_BANNER_DURATION_MS, () => {
      this.worldEventNoticeText.setVisible(false);
    });
  }

  /** Mirrors resetRaidState/resetMerchantState: cancel the pending check, hide any lingering banner, and start a fresh countdown. */
  private resetWorldEventState(): void {
    this.worldEventCheckTimer?.remove();
    this.worldEventCheckTimer = null;
    this.worldEventNoticeHideTimer?.remove();
    this.worldEventNoticeHideTimer = null;
    this.worldEventNoticeText.setVisible(false);
    this.scheduleNextWorldEventCheck();
  }

  /**
   * Runs on the same 2s cadence as production (see setupProductionTimer);
   * no-op when nothing is on the map so an idle game costs nothing extra.
   *
   * Phase 57: the "nothing on the map" bail-out used to be just
   * `this.raidSystem.raiders.length === 0`, which would silently skip
   * resolveUnitAttackOrders/resolveCowboyFire (and therefore never apply any
   * damage) for a unit sent to proactively assault a Raider Camp while no
   * wave happens to be active - exactly the primary offense-phase use case.
   * The guard now also stays open while any unit has a live camp attack
   * order; every other branch below already no-ops cheaply against an empty
   * raiders array.
   *
   * Phase 71: widened a third time - wildlife runs on this same combat-tick
   * cadence but is never gated by a raid wave/attack order at all (it's an
   * ambient hazard, not a raid concept), so the guard now also stays open
   * whenever any wildlife is alive or has a standing attack order against it.
   */
  private runRaidCombatTick(): void {
    const hasCampAttackOrder = this.cowboyUnits.some((unit) => unit.attackTarget?.kind === 'camp');
    const hasWildlifeAttackOrder = this.cowboyUnits.some((unit) => unit.attackTarget?.kind === 'wildlife');
    if (
      this.raidSystem.raiders.length === 0 &&
      this.ambientLifeSystem.wildlife.length === 0 &&
      !hasCampAttackOrder &&
      !hasWildlifeAttackOrder
    ) {
      return;
    }

    for (const raider of this.raidSystem.raiders) {
      this.raidSystem.updateRaiderTargeting(raider);
    }
    this.ambientLifeSystem.runWildlifeTick();
    this.resolveUnitAttackOrders();
    this.raidSystem.resolveRaiderAttacks();
    this.resolveCowboyFire();
    this.resolveWatchtowerFire();
    this.raidSystem.removeDeadRaiders();
    this.removeDestroyedBuildings();
    this.worldVisualsSystem.redrawHpBars();
    this.redrawUnitHpBars();
  }

  /**
   * Phase 40: advances every unit under a live attack order (see
   * issueUnitAttackOrder) one step ahead of resolveRaiderAttacks/
   * resolveCowboyFire - closing the distance if the ordered target is still
   * out of range, or holding position once it's in range. A target that died/
   * was destroyed or otherwise vanished since the order was given clears
   * attackTarget, which is what lets resolveCowboyFire's default
   * nearest-in-range rule take back over for that unit starting this same
   * tick. Phase 57: the target may now be a Raider Camp as well as a raider;
   * getAttackTargetPosition resolves either kind uniformly.
   */
  private resolveUnitAttackOrders(): void {
    for (const unit of this.cowboyUnits) {
      if (!unit.attackTarget || !this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const position = this.getAttackTargetPosition(unit.attackTarget);
      if (!position) {
        unit.attackTarget = null;
        continue;
      }
      this.approachOrEngageTarget(unit, position);
    }
  }

  /** Phase 85: non-private - RaidSystem.resolveRaiderAttacks() looks up the nearest defender to fight. */
  findNearestUnit(x: number, y: number, maxDistance: number): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestDistance = maxDistance;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, unit.image.x, unit.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = unit;
      }
    }

    return best;
  }

  /**
   * Phase 31: a unit that hits 0 HP is gone - sprite destroyed, dropped from
   * the tracking and selection arrays. Its HP slot in gameState stays at 0
   * (see damageUnit) precisely so the surviving units' indices don't shift
   * underneath them.
   */
  /** Phase 85: non-private - RaidSystem.resolveRaiderAttacks() kills a defender that dropped to 0 HP. */
  killUnit(unit: CombatUnit): void {
    unit.moveTween?.stop();
    this.tweens.killTweensOf(unit.image);
    this.spawnDeathPuff(unit.image.x, unit.image.y);
    playWorldSound('unitDeath', unit.image.x, unit.image.y);
    unit.image.destroy();

    this.cowboyUnits = this.cowboyUnits.filter((candidate) => candidate !== unit);
    this.selectedUnits = this.selectedUnits.filter((candidate) => candidate !== unit);
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /** A single small dust puff, reusing the destruction burst's look at unit scale. */
  /** Phase 86: non-private - AmbientLifeSystem.killVillager() reuses this exact death-puff visual. */
  spawnDeathPuff(x: number, y: number): void {
    const puff = this.add.circle(x, y, DUST_PUFF_RADIUS_MAX, DUST_PUFF_COLOR, 0.7).setDepth(DUST_DEPTH);
    this.tweens.add({
      targets: puff,
      alpha: 0,
      scale: 1.8,
      duration: DUST_PUFF_DURATION_MAX_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.killTweensOf(puff);
        puff.destroy();
      },
    });
  }

  /**
   * Phase 31: 0 HP now means destroyed, not "disabled forever". Checked after
   * damage is resolved so a building killed this tick is removed in the same
   * tick that killed it; gameState.destroyBuilding frees its tiles and emits
   * 'building-removed', which drives all the visual cleanup.
   */
  private removeDestroyedBuildings(): void {
    const destroyed = getPlacedBuildings().filter((building) => building.hp <= 0);
    for (const building of destroyed) {
      destroyBuilding(building.id);
    }
  }

  /**
   * Every living unit (this.cowboyUnits holds all four kinds) fires once per
   * combat tick at its own nearest in-range raider - not shared/coordinated
   * targeting. Phase 24: reads each unit's live image position instead of
   * re-deriving a Barracks slot, so a unit moved away from its training
   * building still defends from where it stands. Phase 58: range is now
   * genuinely per-unit (UNIT_KIND_CONFIG) rather than one shared
   * COWBOY_RANGE_TILES, and damage application is delegated to
   * applyUnitDamage so a Dynamiter's splash and every kind's faction
   * counter-multiplier apply uniformly regardless of who's firing.
   */
  private resolveCowboyFire(): void {
    // Phase 34: shots are collected first and sounded once, so the audio layer
    // can decide between N staggered gunshots and a single volley voice
    // (playCombatVolley) with the full shot count in hand.
    const shots: { x: number; y: number }[] = [];
    let anyHit = false;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const rangePx = UNIT_KIND_CONFIG[unit.kind].rangeTiles * TILE_SIZE;
      const position = { x: unit.image.x, y: unit.image.y };
      const target = this.resolveUnitFireTarget(unit, position, rangePx);
      if (!target) {
        continue;
      }
      this.applyUnitDamage(unit, target, position);
      shots.push(position);
      anyHit = true;
    }

    this.playCombatVolley(shots);
    if (anyHit) {
      // One hit acknowledgement per tick, not per shot: the engine would
      // throttle the rest anyway and they'd only muddy the volley.
      const first = shots[0];
      playWorldSound('raiderHit', first.x, first.y);
    }
  }

  /**
   * Phase 58: the single damage-application step every firing unit (Cowboy/
   * Cowboy-on-Horse/Brawler/Dynamiter) routes through - resolves the primary
   * target's faction counter-multiplier (getFactionUnitDamageMultiplier),
   * applies it to the primary hit exactly like the old bare `-= COWBOY_DAMAGE`
   * did, and - only for a Dynamiter - also lobs reduced splash damage at
   * every other live raider/camp/wildlife within DYNAMITER_SPLASH_RADIUS_TILES
   * of the primary target's position (applyDynamiterSplash), each scaled by
   * ITS OWN faction's multiplier rather than the primary target's.
   *
   * Phase 71: widened with a 'wildlife' branch. Wildlife deliberately gets NO
   * faction counter-multiplier row (getFactionUnitDamageMultiplier only
   * indexes RaiderFaction, which wildlife has none of) - flat damage from
   * every unit kind, keeping the balance surface simple per the phase brief.
   */
  private applyUnitDamage(
    unit: CombatUnit,
    target: { kind: 'raider'; raider: Raider } | { kind: 'camp'; camp: RaiderCamp } | { kind: 'wildlife'; wildlife: Wildlife },
    shooterPosition: { x: number; y: number },
  ): void {
    const config = UNIT_KIND_CONFIG[unit.kind];

    if (target.kind === 'wildlife') {
      target.wildlife.hp -= config.damage;
      this.spawnCowboyShotVisual(shooterPosition, target.wildlife.image);
      if (unit.kind === 'dynamiter' && config.splashRadiusTiles && config.splashDamage) {
        this.applyDynamiterSplash(target.wildlife.image.x, target.wildlife.image.y, target, config.splashRadiusTiles, config.splashDamage);
      }
      return;
    }

    const primaryFaction = target.kind === 'raider' ? target.raider.faction : target.camp.faction;
    const primaryDamage = config.damage * getFactionUnitDamageMultiplier(primaryFaction, unit.kind);

    if (target.kind === 'raider') {
      target.raider.hp -= primaryDamage;
      this.spawnCowboyShotVisual(shooterPosition, target.raider.image);
    } else {
      this.raidSystem.damageCamp(target.camp, primaryDamage, shooterPosition);
    }

    if (unit.kind === 'dynamiter' && config.splashRadiusTiles && config.splashDamage) {
      const centerX = target.kind === 'raider' ? target.raider.image.x : target.camp.x;
      const centerY = target.kind === 'raider' ? target.raider.image.y : target.camp.y;
      this.applyDynamiterSplash(centerX, centerY, target, config.splashRadiusTiles, config.splashDamage);
    }
  }

  /**
   * Phase 58: AoE half of a Dynamiter's hit - every OTHER live raider/camp
   * (the primary target already took its full-strength hit in applyUnitDamage)
   * within radiusTiles of the primary target's position takes baseSplashDamage
   * scaled by ITS OWN faction's getFactionUnitDamageMultiplier (a splash
   * landing among a mixed group should counter each target individually, not
   * uniformly apply the primary target's multiplier to everyone caught in it).
   *
   * Phase 71: also splashes other live wildlife within radius - at flat
   * baseSplashDamage, no faction multiplier (wildlife has no faction).
   */
  private applyDynamiterSplash(
    centerX: number,
    centerY: number,
    primary: { kind: 'raider'; raider: Raider } | { kind: 'camp'; camp: RaiderCamp } | { kind: 'wildlife'; wildlife: Wildlife },
    radiusTiles: number,
    baseSplashDamage: number,
  ): void {
    const radiusPx = radiusTiles * TILE_SIZE;

    for (const raider of this.raidSystem.raiders) {
      if (raider.hp <= 0 || (primary.kind === 'raider' && raider.id === primary.raider.id)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(centerX, centerY, raider.image.x, raider.image.y);
      if (distance > radiusPx) {
        continue;
      }
      raider.hp -= baseSplashDamage * getFactionUnitDamageMultiplier(raider.faction, 'dynamiter');
    }

    for (const camp of getRaiderCamps()) {
      if (primary.kind === 'camp' && camp.id === primary.camp.id) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(centerX, centerY, camp.x, camp.y);
      if (distance > radiusPx) {
        continue;
      }
      this.raidSystem.damageCamp(camp, baseSplashDamage * getFactionUnitDamageMultiplier(camp.faction, 'dynamiter'), {
        x: centerX,
        y: centerY,
      });
    }

    for (const creature of this.ambientLifeSystem.wildlife) {
      if (creature.hp <= 0 || (primary.kind === 'wildlife' && creature.id === primary.wildlife.id)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(centerX, centerY, creature.image.x, creature.image.y);
      if (distance > radiusPx) {
        continue;
      }
      creature.hp -= baseSplashDamage;
    }
  }

  /**
   * Phase 40: a unit under a live, in-range attack order focus-fires that
   * specific target - ignoring whatever raider is nearest - so it doesn't get
   * pulled off its ordered target mid-fight. resolveUnitAttackOrders already
   * ran earlier this same tick and either closed the distance or is holding
   * position, so "still out of range" here just means "keep approaching,
   * don't fire yet" rather than falling back to auto-targeting.
   *
   * Phase 57: generalized to a small tagged union so this can resolve either
   * a Raider or (only ever via an explicit order - never the default
   * nearest-in-range fallback below, since a camp is a static objective, not
   * a threat a defender should reflexively engage) a RaiderCamp.
   *
   * Phase 71: widened with a 'wildlife' branch, reachable both via an
   * explicit order (right-click on a Snake/Coyote/Mountain Lion) AND the
   * default nearest-in-range fallback - unlike a camp, wildlife is a genuine
   * roaming threat a defender should reflexively engage, so it's folded into
   * the same "nearest hostile" search as raiders.
   */
  private resolveUnitFireTarget(
    unit: CombatUnit,
    position: { x: number; y: number },
    rangePx: number,
  ): { kind: 'raider'; raider: Raider } | { kind: 'camp'; camp: RaiderCamp } | { kind: 'wildlife'; wildlife: Wildlife } | null {
    if (unit.attackTarget) {
      if (unit.attackTarget.kind === 'raider') {
        const raider = this.raidSystem.raiders.find(
          (candidate) => candidate.id === unit.attackTarget!.id && candidate.hp > 0,
        );
        if (raider) {
          const distance = Phaser.Math.Distance.Between(position.x, position.y, raider.image.x, raider.image.y);
          return distance <= rangePx ? { kind: 'raider', raider } : null;
        }
      } else if (unit.attackTarget.kind === 'wildlife') {
        const creature = this.ambientLifeSystem.wildlife.find(
          (candidate) => candidate.id === unit.attackTarget!.id && candidate.hp > 0,
        );
        if (creature) {
          const distance = Phaser.Math.Distance.Between(position.x, position.y, creature.image.x, creature.image.y);
          return distance <= rangePx ? { kind: 'wildlife', wildlife: creature } : null;
        }
      } else {
        const camp = getRaiderCampById(unit.attackTarget.id);
        if (camp && camp.hp > 0) {
          const distance = Phaser.Math.Distance.Between(position.x, position.y, camp.x, camp.y);
          return distance <= rangePx ? { kind: 'camp', camp } : null;
        }
      }
    }
    const raider = this.findNearestRaider(position.x, position.y, rangePx);
    if (raider) {
      return { kind: 'raider', raider };
    }
    const creature = this.ambientLifeSystem.findNearestWildlife(position.x, position.y, rangePx);
    return creature ? { kind: 'wildlife', wildlife: creature } : null;
  }

  /**
   * Phase 38: Watchtowers fire automatically - no selection/move-order, no
   * player unit to command - so this mirrors resolveCowboyFire's shape
   * (gather shots, apply damage, one shared volley/hit sound) but iterates
   * staffed Watchtower buildings instead of CombatUnits, reusing
   * findNearestRaider/spawnCowboyShotVisual/playCombatVolley as-is rather
   * than duplicating any of that logic for a second shooter type.
   *
   * Phase 71: a Watchtower's nearest-hostile search now also considers
   * wildlife - it auto-defends against a prowling Coyote/Mountain Lion the
   * same way it does a raider, preferring whichever is actually nearer.
   */
  private resolveWatchtowerFire(): void {
    const rangePx = WATCHTOWER_RANGE_TILES * TILE_SIZE;
    const shots: { x: number; y: number }[] = [];
    let anyHit = false;

    for (const building of getPlacedBuildings()) {
      if (building.type !== BuildingType.Watchtower) {
        continue;
      }
      if (building.hp <= 0 || building.disabled || !building.staffed) {
        continue;
      }
      const position = this.tileCenter(building);
      const raiderTarget = this.findNearestRaider(position.x, position.y, rangePx);
      const wildlifeTarget = this.ambientLifeSystem.findNearestWildlife(position.x, position.y, rangePx);

      let target: { hp: number; image: Phaser.GameObjects.Image } | null = raiderTarget;
      if (wildlifeTarget) {
        const raiderDistance = raiderTarget
          ? Phaser.Math.Distance.Between(position.x, position.y, raiderTarget.image.x, raiderTarget.image.y)
          : Infinity;
        const wildlifeDistance = Phaser.Math.Distance.Between(
          position.x,
          position.y,
          wildlifeTarget.image.x,
          wildlifeTarget.image.y,
        );
        if (wildlifeDistance < raiderDistance) {
          target = wildlifeTarget;
        }
      }
      if (!target) {
        continue;
      }
      target.hp -= WATCHTOWER_DAMAGE;
      this.spawnCowboyShotVisual(position, target.image);
      shots.push(position);
      anyHit = true;
    }

    this.playCombatVolley(shots);
    if (anyHit) {
      const first = shots[0];
      playWorldSound('raiderHit', first.x, first.y);
    }
  }

  /** Phase 85: delegates to RaidSystem, which owns the raiders array. */
  private findNearestRaider(x: number, y: number, maxDistance: number): Raider | null {
    return this.raidSystem.findNearestRaider(x, y, maxDistance);
  }

  /** Cheap fire-and-forget visual: a plain line, faded and destroyed shortly after - no projectile-physics/travel-time simulation. */
  /** Phase 85: non-private - RaidSystem.damageCamp() reuses this shot-line visual for a camp hit. */
  spawnCowboyShotVisual(from: { x: number; y: number }, to: Phaser.GameObjects.Image): void {
    const line = this.add.graphics().setDepth(COWBOY_SHOT_DEPTH);
    line.lineStyle(2, COWBOY_SHOT_COLOR, 1);
    line.lineBetween(from.x, from.y, to.x, to.y);
    this.cowboyShotGraphics.push(line);

    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: COWBOY_SHOT_FADE_MS,
      onComplete: () => {
        line.destroy();
        const index = this.cowboyShotGraphics.indexOf(line);
        if (index >= 0) {
          this.cowboyShotGraphics.splice(index, 1);
        }
      },
    });
  }

}
