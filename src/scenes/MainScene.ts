import Phaser from 'phaser';
import {
  BRAWLER_DAMAGE,
  BRAWLER_MAX_HP,
  BRAWLER_MAX_PER_BARRACKS,
  BRAWLER_RANGE_TILES,
  BRAWLER_WALK_SPEED_PX_PER_SEC,
  CAMERA_KEYBOARD_PAN_SPEED_PX_PER_SEC,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  CAMERA_ZOOM_STEP,
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
  MINIMAP_HEIGHT,
  MINIMAP_MARGIN,
  MINIMAP_WIDTH,
  MOUNTED_COWBOY_MAX_HP,
  MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC,
  PRODUCTION_TICK_MS,
  ROAD_UNIT_SPEED_MULTIPLIER,
  ROAD_UNIT_SPEED_SAMPLE_THRESHOLD,
  TILE_SIZE,
  VEGETATION_CLEAR_COST,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  WATCHTOWER_DAMAGE,
  WATCHTOWER_RANGE_TILES,
  WORLD_EVENT_BANNER_DURATION_MS,
  WORLD_EVENT_MAX_INTERVAL_MS,
  WORLD_EVENT_MIN_INTERVAL_MS,
} from '../config/constants';
import { TILE_COLORS, TileType, getWorldTiles } from '../config/mapConfig';
import { VEGETATION_DEFINITIONS } from '../config/vegetationConfig';
import { getVegetation, getVegetationAtTile } from '../state/vegetation';
import { NightOverlay } from '../ui/NightOverlay';
import { ResourceHudPanel } from '../ui/ResourceHudPanel';
import { TILESET_KEY } from './BootScene';
import {
  BRAWLERS_ATLAS_KEY,
  BRAWLER_TEXTURE_KEY,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingCategory,
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
  ResourceKey,
  UnitKind,
  ANIMAL_SPRITE_SIZE,
  buildingTextureKey,
  formatResourceMap,
  getFactionUnitDamageMultiplier,
  getUnitHpArray,
  isLinePlacementBuilding,
} from '../config/buildingConfig';
import {
  installAudioUnlock,
  playPlacementSound,
  playUiSound,
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
  clearVegetationAt,
  computeNetWorth,
  demolishBuilding,
  destroyBuilding,
  getBuildingAtTile,
  getBuildingById,
  getDayNumber,
  getDayPhase,
  getElapsedSeconds,
  getPlacedBuildings,
  getPlacementRejection,
  getPlacementWarning,
  isGameOver,
  placeBuilding,
  runProductionTick,
  setAllGates,
  setRallyPoint,
  tickTimer,
} from '../state/gameState';
import { DustStormOverlay } from '../ui/DustStormOverlay';
import { Raider, RaidSystem } from './systems/RaidSystem';
import { AmbientLifeSystem, Wildlife } from './systems/AmbientLifeSystem';
import { WorldVisualsSystem } from './systems/WorldVisualsSystem';

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

const MINIMAP_VEGETATION_DOT_SIZE = 2;

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

/** Phase 33: placement rejection reason, shown just under the preview footprint. */
const PLACEMENT_HINT_DEPTH = 1000;

const VALID_TINT = 0x00ff00;
const INVALID_TINT = 0xff0000;
const CLICK_MOVE_THRESHOLD = 6;
const MINIMAP_BORDER_COLOR = 0xffffff;
const MINIMAP_VIEWPORT_COLOR = 0xffee58;
const MINIMAP_VIEWPORT_THROTTLE_MS = 50;
const MINIMAP_BUILDING_DOT_SIZE = 3;

/**
 * Phase 45: minimap combat awareness. Live unit/raider dots and building
 * damage-flash/off-screen pings are redrawn on their own Graphics object
 * (minimapCombatGraphics) at the exact same throttle interval the viewport
 * rectangle already uses (MINIMAP_VIEWPORT_THROTTLE_MS), but driven from
 * update() every frame rather than only on camera-move/pointer events -
 * units and raiders drift continuously even while the camera sits still.
 */
const MINIMAP_UNIT_DOT_SIZE = 3;
const MINIMAP_UNIT_COLOR = 0x2979ff;
const MINIMAP_RAIDER_DOT_SIZE = 3;
const MINIMAP_RAIDER_COLOR = 0xff1744;
/** Phase 71: Hostile Wildlife gets its own distinct minimap dot color - orange, distinct from the raider red/unit blue/camp purple - drawn on the same throttled minimapCombatGraphics layer raiders/units share, since a creature roams continuously. */
const MINIMAP_WILDLIFE_DOT_SIZE = 3;
const MINIMAP_WILDLIFE_COLOR = 0xff9100;
/**
 * Phase 57: Raider Camps get their own distinct minimap marker color/size -
 * bigger than a unit dot and drawn on the always-on minimapGraphics (not the
 * throttled minimapCombatGraphics units/raiders share), since a camp is a
 * permanent map feature the player should be able to plan around at any
 * time, not just during an active wave.
 */
const MINIMAP_CAMP_DOT_SIZE = 5;
const MINIMAP_CAMP_COLOR = 0x9c27b0;
/** How long a hit building's minimap dot alternates size/color after taking damage. */
const MINIMAP_FLASH_DURATION_MS = 1600;
/** Blink half-period - the flash dot toggles size every this-many ms. */
const MINIMAP_FLASH_BLINK_MS = 200;
const MINIMAP_FLASH_COLOR = 0xffffff;
const MINIMAP_FLASH_DOT_SIZE = MINIMAP_BUILDING_DOT_SIZE + 3;
/** Off-screen attack ping: how long after the last hit it keeps fading before disappearing. */
const OFFSCREEN_PING_FADE_MS = 3000;
const OFFSCREEN_PING_PULSE_MS = 500;
const OFFSCREEN_PING_COLOR = 0xff6d00;
const OFFSCREEN_PING_RADIUS = 4;
/** Keeps the ping's edge-clamped point from ever touching the minimap's own border stroke. */
const OFFSCREEN_PING_EDGE_INSET = 5;
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

/** Phase 24: Cowboys are player-directed units, so their selection/movement constants live near the combat ones above. */
const COWBOY_WALK_SPEED_PX_PER_SEC = 60;
const COWBOY_SELECT_HIT_RADIUS_PX = 10;
const COWBOY_SELECTION_RING_RADIUS_PX = 10;
const COWBOY_SELECTION_RING_COLOR = 0x42a5f5;
const COWBOY_SELECTION_RING_DEPTH = 13.6;
/** Phase 25: per-unit random offset applied to a multi-unit move order's target point so units don't all walk to the exact same pixel and stack. */
const UNIT_MOVE_ORDER_JITTER_PX = 12;
/** Phase 25: drag-rectangle multi-select box; reuses the selection ring's blue so both read as "the same selection concept". */
const SELECTION_RECT_COLOR = 0x42a5f5;
const SELECTION_RECT_FILL_ALPHA = 0.15;
const SELECTION_RECT_DEPTH = 13.4;

/**
 * Phase 41: hotkeys, WASD camera & control groups.
 * - UNIT_DOUBLE_CLICK_MS: second click-select on the SAME unit within this
 *   window selects every living unit of that unit's kind, mirroring the
 *   dragDistance <= CLICK_MOVE_THRESHOLD click-vs-drag test already used to
 *   reach selectUnitAt in the first place.
 * - CONTROL_GROUP_DOUBLE_TAP_MS: second bare-number-key recall of the SAME
 *   group within this window recenters the camera on it instead of just
 *   re-selecting it again.
 */
const UNIT_DOUBLE_CLICK_MS = 300;
const CONTROL_GROUP_DOUBLE_TAP_MS = 400;

/**
 * Phase 53: Rally Points & Training Queue. A rally point is drawn as a tiny
 * flag-on-a-pole (a Graphics primitive, not a texture - same
 * minimal-footprint style as the harvest ring above) at depth just above the
 * ground/vegetation but below buildings, since it marks a point ON the map
 * rather than something units interact with directly.
 */
const RALLY_POINT_DEPTH = 6.5;
const RALLY_POINT_POLE_COLOR = 0x5d4037;
const RALLY_POINT_FLAG_COLOR = 0xff7043;
const RALLY_POINT_POLE_HEIGHT_PX = 16;
const RALLY_POINT_FLAG_WIDTH_PX = 10;
const RALLY_POINT_FLAG_HEIGHT_PX = 7;

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

const UNIT_KIND_CONFIG: Record<UnitKind, UnitKindConfig> = {
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

/** Phase 45: a snapshot of where/until a building's minimap dot should flash after taking raid damage, kept independent of the building still existing so a killing blow's flash can outlive removeDestroyedBuildings() deleting the record. */
interface MinimapBuildingFlash {
  tileX: number;
  tileY: number;
  until: number;
}

/** Phase 45: an off-screen building currently under attack, tracked so the minimap can point toward it until a few seconds pass without another hit. */
interface OffscreenThreat {
  worldX: number;
  worldY: number;
  lastHitAt: number;
}

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
interface AttackTargetRef {
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
  private infoText!: Phaser.GameObjects.Text;
  private resourceHud!: ResourceHudPanel;
  private timerText!: Phaser.GameObjects.Text;
  private placementHintText!: Phaser.GameObjects.Text;
  private demolishMode = false;
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
  /** Tracked so a building that is destroyed/demolished while its info panel is open closes that panel. */
  /** Phase 86: non-private - WorldVisualsSystem.redrawHarvestRing() reads the currently-selected building. */
  selectedBuildingId: string | null = null;
  private phaseRemainingDisplay = DAY_PHASE_SECONDS;
  /** Phase 86: non-private - WorldVisualsSystem.createNightAccents() reads the overlay's live alpha to match a freshly-placed building's night accents to the current darkness. */
  nightOverlay!: NightOverlay;
  /** Phase 53: shared Graphics redrawn from scratch over every building with a rallyPoint set, mirroring connectionGraphics'/fenceLineGraphics' one-Graphics-per-redraw discipline rather than a GameObject per flag. */
  private rallyPointGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 53: non-null while a "Set Rally Point" button has armed the next qualifying right-click to set that building's rally point instead of issuing a unit move/attack order. */
  private rallyPointModeBuildingId: string | null = null;
  private rallyPointModeHintText!: Phaser.GameObjects.Text;
  private lastFootstepAt = 0;
  private animalSoundTimer: Phaser.Time.TimerEvent | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  /** Phase 86: non-private - WorldVisualsSystem.redrawHarvestRing() reads the currently-selected placement type for its placement-preview ring. */
  selectedType: BuildingType | null = null;
  private previewImage: Phaser.GameObjects.Image | null = null;
  /** Phase 43: pooled preview tiles for a drag-to-place line (Road/Fence), indexed by position along the line; grown on demand, never shrunk (extras past the current line length are just hidden). */
  private linePreviewImages: Phaser.GameObjects.Image[] = [];
  /** Phase 43: running cost tag ("6/8 Road - $60") shown near the drag's end tile while a line preview is active. */
  private lineCostText!: Phaser.GameObjects.Text;
  /** Phase 43: held to keep the placement tool active after a placement (single click or line) instead of exiting - see applyShiftRepeatPolicy. */
  private shiftKey: Phaser.Input.Keyboard.Key | null = null;
  /** Phase 43: previous pointermove's line-drag state, so hideLinePreview only runs on the drag-ended transition rather than every idle mousemove. */
  private lineDragWasActive = false;
  /**
   * Phase 65: touch/tablet controls. Every currently-active (finger-down)
   * touch pointer, keyed by Pointer.id - the only way to reason about a
   * genuine two-finger gesture, since Phaser's leftButtonDown()/rightButtonDown()
   * collapse any touch to "the primary button" regardless of finger count.
   * Populated/cleared purely from pointerdown/pointerup/pointerupoutside, never
   * from pointermove (a moving finger doesn't change which fingers are down).
   */
  private activeTouchPointers = new Map<number, Phaser.Input.Pointer>();
  /** Phase 65: true for exactly the frames where 2+ touch pointers are simultaneously down - the two-finger pan/zoom gesture is active and every single-finger interpretation (box-select, line preview, tap-to-place/select/order) must be suppressed. */
  private twoFingerGestureActive = false;
  /**
   * Phase 65: the two specific pointer ids currently driving the gesture,
   * locked in the instant the gesture starts (first-two-by-arrival, ignoring
   * any stray 3rd+ touch such as a resting palm). Tracking this explicitly -
   * rather than re-deriving "the first two" from activeTouchPointers'
   * iteration order every frame - is what keeps a stray 3rd finger from ever
   * silently swapping into the pair whichever driving finger lifts first:
   * the moment either id in this pair lifts, the WHOLE gesture ends (even if
   * a 3rd finger is still down), rather than the 3rd finger being promoted
   * into a new, differently-baselined pair.
   */
  private twoFingerGestureIds: [number, number] | null = null;
  /** Phase 65: two-finger gesture baseline, re-captured every frame the gesture runs (delta-based, not compared back to gesture-start) so a finger's tiny per-frame jitter can't accumulate into a jump. Null whenever the gesture isn't active. */
  private twoFingerLastMidpointX: number | null = null;
  private twoFingerLastMidpointY: number | null = null;
  private twoFingerLastDistance: number | null = null;
  /**
   * Phase 65: pointer ids that participated in a two-finger gesture during
   * their current press-to-release lifetime. Marked the instant a second
   * finger lands (both ids) and checked (then cleared) on that pointer's own
   * eventual pointerup, so a pinch/pan ending - in any finger-lift order -
   * can never be misread as a tap-to-place/select/move-order by whichever
   * finger happens to lift last.
   */
  private touchPointersSuppressedForTap = new Set<number>();
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
  /** Phase 85: non-private - RaidSystem reads live units when resolving raid attacks and clearing camp attack orders. */
  cowboyUnits: CombatUnit[] = [];
  /** Phase 41: monotonically increasing so every CombatUnit.id is unique for the life of the scene, mirroring raiderIdCounter. */
  private unitIdCounter = 0;
  private selectedUnits: CombatUnit[] = [];
  /** Phase 41: control groups (Ctrl+1..9 assign, bare 1..9 recall) keyed by group number, storing member CombatUnit.ids rather than live references so a dead-and-filtered-out unit is simply absent on the next recall's alive-check. */
  private controlGroups = new Map<number, string[]>();
  /** Phase 41: last this.time.now a bare-number-key recall of a given group fired, for the double-tap-to-recenter check. */
  private lastGroupRecallAt = new Map<number, number>();
  /** Phase 41: double-click-select-all-of-kind state - the id/time of the last unit click-select, independent of controlGroups. */
  private lastUnitClickId: string | null = null;
  private lastUnitClickAt = 0;
  private cameraKeys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private selectionRingGraphics!: Phaser.GameObjects.Graphics;
  private selectionRectGraphics!: Phaser.GameObjects.Graphics;
  private dragStartWorldX = 0;
  private dragStartWorldY = 0;
  private cowboySelectionHintText!: Phaser.GameObjects.Text;
  /** Phase 40: separate shared Graphics object for Cowboy/Cowboy-on-Horse/Raider HP bars, mirroring WorldVisualsSystem's building hpBarGraphics' one-Graphics-per-tick-redraw discipline rather than a GameObject per unit. */
  private unitHpBarGraphics!: Phaser.GameObjects.Graphics;
  private lastInfoTileX: number | null = null;
  private lastInfoTileY: number | null = null;
  private tileData: TileType[][] = [];
  /** Phase 84: stored so 'game-reset' can repaint every tile from a freshly regenerated map (see resetGame's new regenerateWorldTiles call) without rebuilding the whole Tilemap/layer object. */
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private minimapX = 0;
  private minimapY = 0;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private minimapViewportGraphics!: Phaser.GameObjects.Graphics;
  private minimapPointerActive = false;
  private lastMinimapViewportRedraw = 0;
  /** Phase 45: live unit/raider dots + damage flashes/off-screen pings - separate from minimapGraphics since this one redraws continuously instead of only on placement events. */
  private minimapCombatGraphics!: Phaser.GameObjects.Graphics;
  private lastMinimapCombatRedraw = 0;
  /** Phase 82: Viewport Culling - throttle timestamp for updateViewportCulling, following redrawMinimapCombatThrottled's exact pattern. */
  private lastCullUpdate = 0;
  /** Phase 85: non-private - RaidSystem.resetRaidState() clears both wave-scoped maps. */
  minimapBuildingFlashes = new Map<string, MinimapBuildingFlash>();
  offscreenThreats = new Map<string, OffscreenThreat>();

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
    this.worldVisualsSystem.setupVegetationVisuals();
    this.setupCameraDrag();
    this.setupCameraZoom();
    this.setupTouchGestures();
    this.setupKeyboardCamera();
    this.setupInfoText();
    this.setupResourceHud();
    this.setupTimerHud();
    this.setupSpeedControl();
    this.setupMinimap();
    this.setupBuildingPlacement();
    this.setupDemolishMode();
    this.setupBuildingRemoval();
    this.setupBuildingSelection();
    this.setupProductionTimer();
    this.worldVisualsSystem.setupConnectionVisuals();
    this.ambientLifeSystem.setupGoodsCarts();
    this.worldVisualsSystem.setupFenceVisuals();
    this.worldVisualsSystem.setupChainView();
    this.setupAnimalVisuals();
    this.setupHouseTierVisuals();
    this.setupGateVisuals();
    this.setupCowboyVisuals();
    this.setupUnitControl();
    this.setupRallyPoints();
    this.setupHotkeys();
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
    this.setupNotificationLog();
    this.setupGameOverHalt();
    this.setupGameReset();
    this.setupSaveLoad();
    this.pauseForPreGameSelection();
  }

  update(time: number, delta: number): void {
    this.redrawSelectionRing();
    this.updateKeyboardCameraPan(delta);
    // The audio engine culls/pans world sounds against the camera's current
    // view; pushing it here (rather than reading a scene reference from inside
    // the audio module) keeps that module free of any Phaser dependency.
    setAudioListenerRect(this.cameras.main.worldView);
    this.emitFootstepTicks();
    // Phase 45: unlike buildings (event-driven redraw) or the viewport rect
    // (redrawn on camera-move events), units/raiders drift every frame even
    // while the camera and buildings are untouched - so this is the one
    // minimap redraw driven straight from update(), throttled the same way.
    this.redrawMinimapCombatThrottled(time);
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

  /**
   * Phase 63: world coordinates under the pointer, always resolved against the
   * MAIN camera.
   *
   * pointer.worldX/worldY cannot be trusted once a second camera exists:
   * Phaser's InputManager.hitTest overwrites them using whichever camera it is
   * currently hit-testing (InputPlugin.hitTestPointer walks cameras top-most
   * first and stops at the first hit), so while the cursor is over an
   * interactive HUD object - ResourceHudPanel's per-row tooltip Zones are the
   * only ones in this scene - they hold UI-camera coordinates (i.e. raw screen
   * position), not world position. Every placement/selection/order path reads
   * world position through this instead.
   */
  private pointerWorldPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
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

  /**
   * Phase 33: wheel zoom about the cursor. The world point under the pointer
   * is captured before the zoom change and the camera is then scrolled so
   * that same world point lands back under the cursor afterwards - which is
   * what makes it feel like zooming into what you're looking at rather than
   * into the screen centre. The minimap viewport rectangle needs no special
   * handling: it derives from camera.worldView, which is already zoom-aware.
   */
  /**
   * CAMERA_MIN_ZOOM is the *desired* floor, but zooming out far enough that
   * the viewport is larger than the whole map just frames the map in dead
   * space (and pushes the minimap's viewport rectangle outside the minimap).
   * The effective floor is therefore whichever is larger: the configured
   * minimum, or the zoom at which the map exactly fills the viewport.
   */
  private getMinZoom(): number {
    const fitZoom = Math.max(
      VIEWPORT_WIDTH / (MAP_WIDTH_TILES * TILE_SIZE),
      VIEWPORT_HEIGHT / (MAP_HEIGHT_TILES * TILE_SIZE),
    );
    return Math.max(CAMERA_MIN_ZOOM, fitZoom);
  }

  private setupCameraZoom(): void {
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        const camera = this.cameras.main;
        // Phase 63: read through the main camera explicitly rather than
        // pointer.worldX/Y, which the input system may have last written using
        // the UI camera (see pointerWorldPoint). The zoom-to-cursor re-anchor
        // below is unchanged: capture the world point under the cursor before
        // the zoom, then scroll by however far that same point moved after it.
        const preZoom = this.pointerWorldPoint(pointer);
        const worldPointX = preZoom.x;
        const worldPointY = preZoom.y;

        const direction = dy > 0 ? -1 : 1;
        const nextZoom = Phaser.Math.Clamp(
          camera.zoom + direction * CAMERA_ZOOM_STEP * camera.zoom,
          this.getMinZoom(),
          CAMERA_MAX_ZOOM,
        );
        if (nextZoom === camera.zoom) {
          return;
        }
        camera.setZoom(nextZoom);

        // Re-anchor: after the zoom the same screen offset maps to a
        // different world offset, so shift scroll by the difference.
        const newWorldPoint = camera.getWorldPoint(pointer.x, pointer.y);
        camera.scrollX += worldPointX - newWorldPoint.x;
        camera.scrollY += worldPointY - newWorldPoint.y;

        this.redrawMinimapViewport();
      },
    );
  }

  private setupCameraDrag(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Phase 65: a two-finger gesture owns all interpretation of both its
      // pointers' movement (see setupTouchGestures, registered separately);
      // every single-finger drag branch below (pan/box-select/line-preview)
      // must sit out entirely while it's active, not just decline to redraw -
      // updateSelectionRectangle/updateLinePreview would otherwise keep
      // stretching a stale box/line toward whichever finger this handler
      // happens to be called for.
      if (this.twoFingerGestureActive) {
        return;
      }

      if (this.minimapPointerActive) {
        if (pointer.isDown) {
          this.navigateMinimapTo(pointer);
        }
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
        return;
      }

      // Phase 25: camera-pan moved from left-drag to right-drag so left-drag is
      // free for the unit selection rectangle. `pointer.isDown` (used here
      // pre-Phase-25) is true for ANY held button - see Phaser's Pointer.isDown
      // doc ("is _any_ button... considered as being down"), so panning now
      // needs the same explicit rightButtonDown()/leftButtonDown() checks the
      // rest of this file already uses elsewhere (e.g. setupBuildingPlacement).
      //
      // Phase 43: left-drag is the SAME gesture Phase 25 uses for the unit
      // box-select, branched here on placement-mode state so the two never
      // fire together - box-select's own branch below already requires
      // `this.selectedType === null`, so a line-friendly building being
      // selected (Road/Fence) automatically routes left-drag into the line
      // preview instead, with no separate mode flag needed on the box-select
      // side.
      const dxFromDown = pointer.x - this.pointerDownX;
      const dyFromDown = pointer.y - this.pointerDownY;
      const dragDistance = Math.sqrt(dxFromDown * dxFromDown + dyFromDown * dyFromDown);
      const isLineDragging =
        this.selectedType !== null &&
        isLinePlacementBuilding(this.selectedType) &&
        pointer.leftButtonDown() &&
        dragDistance > CLICK_MOVE_THRESHOLD;

      if (pointer.rightButtonDown() && this.selectedType === null) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
        this.redrawMinimapViewportThrottled();
      } else if (isLineDragging) {
        this.updateLinePreview(pointer);
      } else if (pointer.leftButtonDown() && this.selectedType === null) {
        this.updateSelectionRectangle(pointer);
      }

      if (!isLineDragging && this.lineDragWasActive) {
        this.hideLinePreview();
      }
      this.lineDragWasActive = isLineDragging;

      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.updateInfoText(pointer);
      if (!isLineDragging) {
        this.updatePreview(pointer);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
      const dragStartWorld = this.pointerWorldPoint(pointer);
      this.dragStartWorldX = dragStartWorld.x;
      this.dragStartWorldY = dragStartWorld.y;

      this.minimapPointerActive = this.isPointerInMinimap(pointer);
      if (this.minimapPointerActive) {
        this.navigateMinimapTo(pointer);
      }
    });
  }

  /**
   * Phase 65: touch/tablet controls - two-finger pan+pinch-zoom, plus the
   * bookkeeping (activeTouchPointers/twoFingerGestureActive/
   * touchPointersSuppressedForTap) every other touch-aware branch in this
   * file reads. This method OWNS tracking which touch pointers are currently
   * down; it registers its own pointerdown/pointerup/pointerupoutside/
   * pointermove listeners rather than reusing setupCameraDrag's, so a
   * two-finger gesture's start/end can be detected the instant it happens
   * (on the pointerdown/up that changes the count) rather than inferred later
   * from pointermove.
   *
   * State machine:
   * - 0->1 touch pointers down: nothing special: normal single-finger path
   *   (setupCameraDrag/setupBuildingPlacement/setupUnitControl etc.) runs
   *   completely unmodified, since wasTouch-gated code here never fires for a
   *   single touch.
   * - 1->2: the just-added pointer's pointerdown handler here detects
   *   activeTouchPointers.size reaching 2, flips twoFingerGestureActive on,
   *   captures the two pointers' midpoint/distance as this frame's baseline,
   *   marks BOTH pointer ids in touchPointersSuppressedForTap (so neither
   *   finger's eventual lift can fire a tap action), and immediately clears
   *   any in-flight single-finger drag visuals (selection rectangle, line
   *   preview) - a second finger landing mid-drag must not leave either
   *   stranded on screen.
   * - while 2 (or more - a stray 3rd touch is ignored, only the first two
   *   tracked ids drive the gesture): every pointermove from either
   *   participating pointer recomputes the midpoint/distance from BOTH
   *   pointers' latest known positions and pans/zooms by the delta against
   *   the previous frame's baseline (not gesture-start), then rewrites the
   *   baseline - so per-frame jitter can't accumulate and a finger that
   *   simply isn't moving this event doesn't cause a jump.
   * - 2->1 (one finger lifts, one stays down): the lifted pointer is removed
   *   from activeTouchPointers, twoFingerGestureActive turns off, and -
   *   critically - the REMAINING pointer's lastPointerX/Y (which
   *   setupCameraDrag's single-finger pan math reads a raw delta against) and
   *   pointerDownX/Y/dragStartWorldX/Y (which click-vs-drag distance and
   *   box-select/line-preview read) are all re-baselined to that pointer's
   *   current position. Without this, the very next pointermove for the
   *   surviving finger would compute a pan/drag delta against wherever it was
   *   dragged to potentially several inches ago, at the moment it first
   *   pressed down - a large, jarring jump.
   * - 1->0 or 2->0 (last finger(s) lift): activeTouchPointers empties,
   *   twoFingerGestureActive turns off, baseline nulled. Both orders (lift
   *   one-then-other vs both nearly simultaneously) reduce to the same final
   *   state since each pointerup is handled independently.
   */
  private setupTouchGestures(): void {
    const endTwoFingerGesture = (): void => {
      this.twoFingerGestureActive = false;
      this.twoFingerGestureIds = null;
      this.twoFingerLastMidpointX = null;
      this.twoFingerLastMidpointY = null;
      this.twoFingerLastDistance = null;
    };

    // Re-baseline the surviving finger so the ordinary single-finger
    // pan/drag/tap code (which only ever reads lastPointerX/Y and
    // pointerDownX/Y, with no knowledge a pinch just ended) starts fresh
    // from here rather than jumping back to that finger's original
    // touchdown point (or, worse, computing a delta against the OTHER
    // finger's last position).
    const rebaselineSingleFinger = (pointer: Phaser.Input.Pointer): void => {
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
      const world = this.pointerWorldPoint(pointer);
      this.dragStartWorldX = world.x;
      this.dragStartWorldY = world.y;
    };

    const removeTouchPointer = (pointer: Phaser.Input.Pointer): void => {
      this.activeTouchPointers.delete(pointer.id);

      const wasDrivingGesture =
        this.twoFingerGestureIds !== null &&
        (this.twoFingerGestureIds[0] === pointer.id || this.twoFingerGestureIds[1] === pointer.id);

      if (wasDrivingGesture) {
        // Either driving finger lifting ends the WHOLE gesture outright, even
        // if a stray 3rd touch is still down - see twoFingerGestureIds' own
        // doc comment for why a 3rd finger is never promoted into the pair.
        endTwoFingerGesture();

        // Exactly one other touch pointer remains (the gesture's other
        // finger, if it's still down) -> that's a real single-finger
        // continuation and needs re-baselining. Zero or 2+ remaining means
        // either everything lifted (nothing to re-baseline) or a stray extra
        // finger makes "the" remaining pointer ambiguous, so no single-finger
        // gesture resumes until it's down to exactly one.
        if (this.activeTouchPointers.size === 1) {
          const remaining = this.activeTouchPointers.values().next().value as
            | Phaser.Input.Pointer
            | undefined;
          if (remaining) {
            rebaselineSingleFinger(remaining);
          }
        }
      }
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch) {
        return;
      }
      this.activeTouchPointers.set(pointer.id, pointer);

      if (this.twoFingerGestureIds === null && this.activeTouchPointers.size === 2) {
        const [p1, p2] = [...this.activeTouchPointers.values()];
        this.twoFingerGestureActive = true;
        this.twoFingerGestureIds = [p1.id, p2.id];
        this.twoFingerLastMidpointX = (p1.x + p2.x) / 2;
        this.twoFingerLastMidpointY = (p1.y + p2.y) / 2;
        this.twoFingerLastDistance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        this.touchPointersSuppressedForTap.add(p1.id);
        this.touchPointersSuppressedForTap.add(p2.id);

        // A second finger landing mid-drag must not leave a stray selection
        // box or line-placement preview on screen once the gesture takes
        // over - these are the only two "drawn while a single finger is held
        // down" visuals a pinch could interrupt (the placement preview
        // itself is harmless to leave showing, and hiding it here would
        // fight updatePreview's own per-move redraw the moment the pinch
        // ends).
        this.selectionRectGraphics.clear();
        if (this.lineDragWasActive) {
          this.hideLinePreview();
          this.lineDragWasActive = false;
        }
      } else if (this.twoFingerGestureIds !== null) {
        // A stray 3rd+ touch while a gesture is already locked in (e.g. a
        // resting palm) is tracked for cleanup purposes only - it never
        // joins the driving pair and can't affect the gesture's math -
        // but is still marked non-tap-worthy in case it's the finger that
        // ends up lifting last.
        this.touchPointersSuppressedForTap.add(pointer.id);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch || !this.activeTouchPointers.has(pointer.id)) {
        return;
      }
      // Keep the tracked pointer reference fresh (Phaser reuses the same
      // Pointer object per slot, so this is mostly a no-op, but the
      // activeTouchPointers.has check above is what matters for correctness
      // here).
      this.activeTouchPointers.set(pointer.id, pointer);

      if (
        !this.twoFingerGestureActive ||
        this.twoFingerGestureIds === null ||
        this.twoFingerLastMidpointX === null ||
        this.twoFingerLastMidpointY === null ||
        this.twoFingerLastDistance === null
      ) {
        return;
      }

      // Only the two pointers actually driving the gesture ever feed its
      // math - a moving stray 3rd finger is fully ignored, not just excluded
      // from "the first two by iteration order" (see twoFingerGestureIds).
      const p1 = this.activeTouchPointers.get(this.twoFingerGestureIds[0]);
      const p2 = this.activeTouchPointers.get(this.twoFingerGestureIds[1]);
      if (!p1 || !p2) {
        return;
      }

      const midpointX = (p1.x + p2.x) / 2;
      const midpointY = (p1.y + p2.y) / 2;
      const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);

      const camera = this.cameras.main;

      // Pan: same raw, unscaled-by-zoom screen-px delta straight onto
      // scrollX/scrollY that the existing right-drag pan uses (setupCameraDrag).
      const panDx = midpointX - this.twoFingerLastMidpointX;
      const panDy = midpointY - this.twoFingerLastMidpointY;
      camera.scrollX -= panDx;
      camera.scrollY -= panDy;

      // Zoom: re-anchor the pre-zoom world point under the (post-pan) midpoint,
      // mirroring setupCameraZoom's wheel-zoom-to-cursor logic exactly, just
      // driven by a distance ratio instead of a fixed step per wheel notch.
      if (this.twoFingerLastDistance > 0) {
        const preZoomWorld = camera.getWorldPoint(midpointX, midpointY);
        const zoomRatio = distance / this.twoFingerLastDistance;
        const nextZoom = Phaser.Math.Clamp(
          camera.zoom * zoomRatio,
          this.getMinZoom(),
          CAMERA_MAX_ZOOM,
        );
        if (nextZoom !== camera.zoom) {
          camera.setZoom(nextZoom);
          const postZoomWorld = camera.getWorldPoint(midpointX, midpointY);
          camera.scrollX += preZoomWorld.x - postZoomWorld.x;
          camera.scrollY += preZoomWorld.y - postZoomWorld.y;
        }
      }

      this.twoFingerLastMidpointX = midpointX;
      this.twoFingerLastMidpointY = midpointY;
      this.twoFingerLastDistance = distance;
      this.redrawMinimapViewportThrottled();
    });

    const handleTouchRelease = (pointer: Phaser.Input.Pointer): void => {
      if (!pointer.wasTouch) {
        return;
      }
      removeTouchPointer(pointer);
    };

    this.input.on('pointerup', handleTouchRelease);
    this.input.on('pointerupoutside', handleTouchRelease);

    gameEvents.on('game-reset', () => {
      this.activeTouchPointers.clear();
      endTwoFingerGesture();
      this.touchPointersSuppressedForTap.clear();
    });
  }

  /**
   * Phase 65: true if this pointerup should NOT trigger a tap-action (place/
   * select/box-select-resolve/move-order/attack-order/rally-point-pick) -
   * either it just took part in a two-finger gesture, or the gesture is
   * somehow still flagged active (defensive; the count-based check in
   * removeTouchPointer should already have cleared it by the time any
   * pointerup listener runs, since setupTouchGestures' own pointerup handler
   * is registered before setupBuildingPlacement/setupBuildingSelection/
   * setupUnitControl in create()'s call order and Phaser fires listeners for
   * the same event in registration order). Consumes (deletes) the pointer's
   * suppression flag so a later, genuinely-fresh single-finger tap on the
   * same recycled pointer slot isn't permanently suppressed.
   */
  private consumeTouchTapSuppression(pointer: Phaser.Input.Pointer): boolean {
    if (!pointer.wasTouch) {
      return false;
    }
    const wasSuppressed = this.touchPointersSuppressedForTap.delete(pointer.id);
    return wasSuppressed || this.twoFingerGestureActive;
  }

  /**
   * World-space rectangle (no setScrollFactor(0), same as
   * redrawConnectionOutlines/redrawFenceLines/redrawSelectionRing) drawn
   * between the drag-start point and the current pointer, both captured as
   * world coordinates - not screen coordinates - so the box stays correctly
   * anchored over the ground/units even if the camera scrolls mid-drag.
   */
  private updateSelectionRectangle(pointer: Phaser.Input.Pointer): void {
    this.selectionRectGraphics.clear();

    const dx = pointer.x - this.pointerDownX;
    const dy = pointer.y - this.pointerDownY;
    if (Math.sqrt(dx * dx + dy * dy) <= CLICK_MOVE_THRESHOLD) {
      return;
    }

    const world = this.pointerWorldPoint(pointer);
    const minX = Math.min(this.dragStartWorldX, world.x);
    const minY = Math.min(this.dragStartWorldY, world.y);
    const width = Math.abs(world.x - this.dragStartWorldX);
    const height = Math.abs(world.y - this.dragStartWorldY);

    this.selectionRectGraphics.fillStyle(SELECTION_RECT_COLOR, SELECTION_RECT_FILL_ALPHA);
    this.selectionRectGraphics.fillRect(minX, minY, width, height);
    this.selectionRectGraphics.lineStyle(1, SELECTION_RECT_COLOR, 1);
    this.selectionRectGraphics.strokeRect(minX, minY, width, height);
  }

  /**
   * Phase 41: continuous WASD/arrow-key camera panning, checked every frame
   * in update() rather than on one-shot keydown events - addKey()'s .isDown
   * reflects the held state directly, the same "poll, don't event" approach
   * Phaser's own docs recommend for movement. Diagonal input is normalized so
   * holding two keys doesn't pan faster than one. No zoom adjustment, same
   * simplification setupCameraDrag's right-drag pan already uses (raw screen-
   * px delta straight onto scrollX/scrollY); camera.setBounds (buildTilemap)
   * clamps the result to the map exactly as it already clamps drag-pan.
   */
  private setupKeyboardCamera(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.cameraKeys = {
      w: keyboard.addKey(KeyCodes.W),
      a: keyboard.addKey(KeyCodes.A),
      s: keyboard.addKey(KeyCodes.S),
      d: keyboard.addKey(KeyCodes.D),
      up: keyboard.addKey(KeyCodes.UP),
      down: keyboard.addKey(KeyCodes.DOWN),
      left: keyboard.addKey(KeyCodes.LEFT),
      right: keyboard.addKey(KeyCodes.RIGHT),
    };
  }

  private updateKeyboardCameraPan(deltaMs: number): void {
    if (!this.cameraKeys) {
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.cameraKeys.a.isDown || this.cameraKeys.left.isDown) {
      dx -= 1;
    }
    if (this.cameraKeys.d.isDown || this.cameraKeys.right.isDown) {
      dx += 1;
    }
    if (this.cameraKeys.w.isDown || this.cameraKeys.up.isDown) {
      dy -= 1;
    }
    if (this.cameraKeys.s.isDown || this.cameraKeys.down.isDown) {
      dy += 1;
    }

    if (dx === 0 && dy === 0) {
      return;
    }

    const length = Math.sqrt(dx * dx + dy * dy);
    const distance = (CAMERA_KEYBOARD_PAN_SPEED_PX_PER_SEC * deltaMs) / 1000;
    this.cameras.main.scrollX += (dx / length) * distance;
    this.cameras.main.scrollY += (dy / length) * distance;
    this.redrawMinimapViewportThrottled();
  }

  private setupInfoText(): void {
    this.infoText = this.add.text(8, VIEWPORT_HEIGHT - 8, 'tile: -, -', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
    });
    this.infoText.setOrigin(0, 1);
    this.infoText.setScrollFactor(0);
    this.infoText.setDepth(1000);
    this.registerUiObject(this.infoText);

    // World-space (no setScrollFactor(0)) so it stays pinned under the
    // preview footprint it is describing as the camera pans/zooms.
    this.placementHintText = this.add
      .text(0, 0, '', {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#c62828dd',
        padding: { x: 4, y: 2 },
      })
      .setDepth(PLACEMENT_HINT_DEPTH)
      .setVisible(false);

    // Phase 43: world-space like placementHintText, above it while a line
    // drag is active (the two are never shown at once - see updateLinePreview).
    this.lineCostText = this.add
      .text(0, 0, '', {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#2e7d32dd',
        padding: { x: 4, y: 2 },
      })
      .setDepth(PLACEMENT_HINT_DEPTH)
      .setVisible(false);
  }

  private updateInfoText(pointer: Phaser.Input.Pointer): void {
    const { tileX, tileY } = this.pointerToTile(pointer);
    if (tileX === this.lastInfoTileX && tileY === this.lastInfoTileY) {
      return;
    }
    this.lastInfoTileX = tileX;
    this.lastInfoTileY = tileY;
    this.infoText.setText(`tile: ${tileX}, ${tileY}`);
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

  private setupMinimap(): void {
    this.minimapX = MINIMAP_MARGIN;
    this.minimapY = this.resourceHud.getBottomY() + MINIMAP_MARGIN;

    this.minimapGraphics = this.add.graphics();
    this.minimapGraphics.setScrollFactor(0);
    this.minimapGraphics.setDepth(1000);

    this.minimapViewportGraphics = this.add.graphics();
    this.minimapViewportGraphics.setScrollFactor(0);
    this.minimapViewportGraphics.setDepth(1001);

    // Phase 45: above the viewport rectangle so live combat dots/pings are
    // never hidden behind it.
    this.minimapCombatGraphics = this.add.graphics();
    this.minimapCombatGraphics.setScrollFactor(0);
    this.minimapCombatGraphics.setDepth(1002);

    // Phase 63: all three minimap layers are HUD, drawn in screen coordinates
    // (minimapX/minimapY + a tile-scaled offset). Their relative depths
    // 1000/1001/1002 still order them against each other inside the UI
    // camera's own render list exactly as before.
    this.registerUiObject(
      this.minimapGraphics,
      this.minimapViewportGraphics,
      this.minimapCombatGraphics,
    );

    this.redrawMinimap();

    gameEvents.on('building-placed', () => this.redrawMinimap());
    gameEvents.on('game-reset', () => this.redrawMinimap());

    // Phase 82: viewport culling for newly created sprites is deliberately
    // NOT wired as a 'building-placed'/'game-loaded'/'game-reset' listener
    // here. gameState.placeBuilding emits 'building-placed' BEFORE
    // placeBuildingAt calls createVisualForBuilding (see that method's own
    // "connections-updated already fired before this building's visual
    // existed" comment for the identical, pre-existing ordering quirk), and
    // Phaser fires listeners in registration order, so this method
    // (setupMinimap, called early in create()) would in any case run before
    // setupSaveLoad/setupGameReset's own rebuild listeners. Instead,
    // updateViewportCulling() is called directly, right after the relevant
    // sprites actually exist, from placeBuildingAt, setupSaveLoad's
    // 'game-loaded' handler, and setupGameReset's 'game-reset' handler.
  }

  /** Phase 85: non-private - RaidSystem redraws the minimap after camps spawn/are destroyed. */
  redrawMinimap(): void {
    this.minimapGraphics.clear();

    const tileWidth = MINIMAP_WIDTH / MAP_WIDTH_TILES;
    const tileHeight = MINIMAP_HEIGHT / MAP_HEIGHT_TILES;

    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const tileType = this.tileData[y]?.[x] ?? TileType.Dirt;
        this.minimapGraphics.fillStyle(TILE_COLORS[tileType], 1);
        this.minimapGraphics.fillRect(
          this.minimapX + x * tileWidth,
          this.minimapY + y * tileHeight,
          tileWidth,
          tileHeight,
        );
      }
    }

    // Phase 30: vegetation is drawn under the building dots - it's terrain-
    // scale context (where the woods and cactus fields are, i.e. where a
    // Forestry or Cactus Milker would pay off), not a town landmark.
    for (const entity of getVegetation()) {
      this.minimapGraphics.fillStyle(VEGETATION_DEFINITIONS[entity.kind].color, 1);
      this.minimapGraphics.fillRect(
        this.minimapX + entity.tileX * tileWidth,
        this.minimapY + entity.tileY * tileHeight,
        MINIMAP_VEGETATION_DOT_SIZE,
        MINIMAP_VEGETATION_DOT_SIZE,
      );
    }

    for (const building of getPlacedBuildings()) {
      const { width, height } = BUILDING_DEFINITIONS[building.type].size;
      const centerTileX = building.tileX + width / 2;
      const centerTileY = building.tileY + height / 2;
      this.minimapGraphics.fillStyle(BUILDING_DEFINITIONS[building.type].color, 1);
      this.minimapGraphics.fillRect(
        this.minimapX + centerTileX * tileWidth - MINIMAP_BUILDING_DOT_SIZE / 2,
        this.minimapY + centerTileY * tileHeight - MINIMAP_BUILDING_DOT_SIZE / 2,
        MINIMAP_BUILDING_DOT_SIZE,
        MINIMAP_BUILDING_DOT_SIZE,
      );
    }

    // Phase 57: Raider Camps are drawn on this always-on layer (redrawn on
    // building-placed/game-reset/camp-spawned/camp-destroyed), not the
    // throttled per-frame minimapCombatGraphics units/raiders share - a camp
    // never moves and should be visible as a standing objective regardless of
    // whether a wave is currently active.
    this.minimapGraphics.fillStyle(MINIMAP_CAMP_COLOR, 1);
    for (const camp of getRaiderCamps()) {
      const tileX = camp.x / TILE_SIZE;
      const tileY = camp.y / TILE_SIZE;
      this.minimapGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_CAMP_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_CAMP_DOT_SIZE / 2,
        MINIMAP_CAMP_DOT_SIZE,
        MINIMAP_CAMP_DOT_SIZE,
      );
    }

    this.minimapGraphics.lineStyle(1, MINIMAP_BORDER_COLOR, 0.8);
    this.minimapGraphics.strokeRect(this.minimapX, this.minimapY, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    this.redrawMinimapViewport();
  }

  private redrawMinimapViewportThrottled(): void {
    const now = this.time.now;
    if (now - this.lastMinimapViewportRedraw < MINIMAP_VIEWPORT_THROTTLE_MS) {
      return;
    }
    this.lastMinimapViewportRedraw = now;
    this.redrawMinimapViewport();
  }

  private redrawMinimapViewport(): void {
    this.minimapViewportGraphics.clear();

    const worldView = this.cameras.main.worldView;
    const mapPixelWidth = MAP_WIDTH_TILES * TILE_SIZE;
    const mapPixelHeight = MAP_HEIGHT_TILES * TILE_SIZE;

    // worldView is zoom-aware, so this follows the camera's zoom for free
    // (Phase 33). Clamped to the minimap's own rect so a viewport wider than
    // the map (possible at the minimum zoom on non-default viewport sizes)
    // can never draw its rectangle outside the minimap frame.
    const rectX = this.minimapX + Phaser.Math.Clamp(worldView.x / mapPixelWidth, 0, 1) * MINIMAP_WIDTH;
    const rectY = this.minimapY + Phaser.Math.Clamp(worldView.y / mapPixelHeight, 0, 1) * MINIMAP_HEIGHT;
    const rectW = Math.min(
      (worldView.width / mapPixelWidth) * MINIMAP_WIDTH,
      this.minimapX + MINIMAP_WIDTH - rectX,
    );
    const rectH = Math.min(
      (worldView.height / mapPixelHeight) * MINIMAP_HEIGHT,
      this.minimapY + MINIMAP_HEIGHT - rectY,
    );

    this.minimapViewportGraphics.lineStyle(2, MINIMAP_VIEWPORT_COLOR, 1);
    this.minimapViewportGraphics.strokeRect(rectX, rectY, rectW, rectH);
  }

  /**
   * Phase 45: same throttle-and-redraw pair as redrawMinimapViewportThrottled/
   * redrawMinimapViewport, but called every update() frame instead of only on
   * camera-move/pointer events, since units and raiders keep moving on their
   * own.
   */
  private redrawMinimapCombatThrottled(now: number): void {
    if (now - this.lastMinimapCombatRedraw < MINIMAP_VIEWPORT_THROTTLE_MS) {
      return;
    }
    this.lastMinimapCombatRedraw = now;
    this.redrawMinimapCombat(now);
  }

  private redrawMinimapCombat(now: number): void {
    this.minimapCombatGraphics.clear();

    const tileWidth = MINIMAP_WIDTH / MAP_WIDTH_TILES;
    const tileHeight = MINIMAP_HEIGHT / MAP_HEIGHT_TILES;

    this.redrawMinimapBuildingFlashes(now, tileWidth, tileHeight);

    this.minimapCombatGraphics.fillStyle(MINIMAP_UNIT_COLOR, 1);
    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const tileX = unit.image.x / TILE_SIZE;
      const tileY = unit.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_UNIT_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_UNIT_DOT_SIZE / 2,
        MINIMAP_UNIT_DOT_SIZE,
        MINIMAP_UNIT_DOT_SIZE,
      );
    }

    this.minimapCombatGraphics.fillStyle(MINIMAP_RAIDER_COLOR, 1);
    for (const raider of this.raidSystem.raiders) {
      const tileX = raider.image.x / TILE_SIZE;
      const tileY = raider.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_RAIDER_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_RAIDER_DOT_SIZE / 2,
        MINIMAP_RAIDER_DOT_SIZE,
        MINIMAP_RAIDER_DOT_SIZE,
      );
    }

    this.minimapCombatGraphics.fillStyle(MINIMAP_WILDLIFE_COLOR, 1);
    for (const creature of this.ambientLifeSystem.wildlife) {
      const tileX = creature.image.x / TILE_SIZE;
      const tileY = creature.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_WILDLIFE_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_WILDLIFE_DOT_SIZE / 2,
        MINIMAP_WILDLIFE_DOT_SIZE,
        MINIMAP_WILDLIFE_DOT_SIZE,
      );
    }

    this.redrawOffscreenThreatPings(now);
  }

  /** Prunes expired flashes, then draws the surviving ones alternating size on MINIMAP_FLASH_BLINK_MS. */
  private redrawMinimapBuildingFlashes(now: number, tileWidth: number, tileHeight: number): void {
    for (const [buildingId, flash] of this.minimapBuildingFlashes) {
      if (now >= flash.until) {
        this.minimapBuildingFlashes.delete(buildingId);
        continue;
      }

      const blinkOn = Math.floor((flash.until - now) / MINIMAP_FLASH_BLINK_MS) % 2 === 0;
      const size = blinkOn ? MINIMAP_FLASH_DOT_SIZE : MINIMAP_BUILDING_DOT_SIZE;
      this.minimapCombatGraphics.fillStyle(MINIMAP_FLASH_COLOR, 1);
      this.minimapCombatGraphics.fillRect(
        this.minimapX + flash.tileX * tileWidth - size / 2,
        this.minimapY + flash.tileY * tileHeight - size / 2,
        size,
        size,
      );
    }
  }

  /**
   * Phase 45: for every building currently under off-screen attack, draws a
   * pulsing dot at the point where a line from the minimap's centre to that
   * building's minimap position crosses the minimap's own border - a compact
   * "the threat is that way" indicator that fades out once
   * OFFSCREEN_PING_FADE_MS has passed since the last hit. Re-checks current
   * on-screen-ness every call (rather than trusting the off-screen snapshot
   * taken at hit time) so panning onto the fight clears its ping immediately.
   */
  private redrawOffscreenThreatPings(now: number): void {
    for (const [buildingId, threat] of this.offscreenThreats) {
      if (now - threat.lastHitAt > OFFSCREEN_PING_FADE_MS) {
        this.offscreenThreats.delete(buildingId);
        continue;
      }
      if (this.isWorldPointInViewport(threat.worldX, threat.worldY)) {
        continue;
      }

      const mapPixelWidth = MAP_WIDTH_TILES * TILE_SIZE;
      const mapPixelHeight = MAP_HEIGHT_TILES * TILE_SIZE;
      const targetX = this.minimapX + Phaser.Math.Clamp(threat.worldX / mapPixelWidth, 0, 1) * MINIMAP_WIDTH;
      const targetY = this.minimapY + Phaser.Math.Clamp(threat.worldY / mapPixelHeight, 0, 1) * MINIMAP_HEIGHT;

      const centerX = this.minimapX + MINIMAP_WIDTH / 2;
      const centerY = this.minimapY + MINIMAP_HEIGHT / 2;
      const dx = targetX - centerX;
      const dy = targetY - centerY;
      const halfW = MINIMAP_WIDTH / 2 - OFFSCREEN_PING_EDGE_INSET;
      const halfH = MINIMAP_HEIGHT / 2 - OFFSCREEN_PING_EDGE_INSET;
      const scale = Math.min(
        dx !== 0 ? Math.abs(halfW / dx) : Infinity,
        dy !== 0 ? Math.abs(halfH / dy) : Infinity,
        1,
      );
      const edgeX = centerX + dx * scale;
      const edgeY = centerY + dy * scale;

      const fadeAlpha = Phaser.Math.Clamp(1 - (now - threat.lastHitAt) / OFFSCREEN_PING_FADE_MS, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(now / OFFSCREEN_PING_PULSE_MS);
      this.minimapCombatGraphics.fillStyle(OFFSCREEN_PING_COLOR, fadeAlpha * (0.4 + 0.6 * pulse));
      this.minimapCombatGraphics.fillCircle(edgeX, edgeY, OFFSCREEN_PING_RADIUS);
    }
  }

  private isWorldPointInViewport(worldX: number, worldY: number): boolean {
    const view = this.cameras.main.worldView;
    return worldX >= view.x && worldX <= view.right && worldY >= view.y && worldY <= view.bottom;
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
  private updateViewportCulling(): void {
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
   * Phase 45: called right after a raider damages a building (resolveRaiderAttacks)
   * so a hit anywhere on the map shows up on the minimap even if the player
   * is looking elsewhere. Snapshots the building's own centre tile rather
   * than holding a PlacedBuilding reference, so the flash still renders for
   * its full duration even if this same hit destroyed the building and
   * removeDestroyedBuildings() drops it from gameState a moment later.
   */
  /** Phase 85: non-private - RaidSystem.resolveRaiderAttacks() calls this after a raider damages a building. */
  registerMinimapBuildingDamage(building: PlacedBuilding): void {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const centerTileX = building.tileX + width / 2;
    const centerTileY = building.tileY + height / 2;
    const now = this.time.now;

    this.minimapBuildingFlashes.set(building.id, {
      tileX: centerTileX,
      tileY: centerTileY,
      until: now + MINIMAP_FLASH_DURATION_MS,
    });

    const worldX = centerTileX * TILE_SIZE;
    const worldY = centerTileY * TILE_SIZE;
    if (this.isWorldPointInViewport(worldX, worldY)) {
      this.offscreenThreats.delete(building.id);
    } else {
      this.offscreenThreats.set(building.id, { worldX, worldY, lastHitAt: now });
    }
  }

  private isPointerInMinimap(pointer: Phaser.Input.Pointer): boolean {
    return (
      pointer.x >= this.minimapX &&
      pointer.x <= this.minimapX + MINIMAP_WIDTH &&
      pointer.y >= this.minimapY &&
      pointer.y <= this.minimapY + MINIMAP_HEIGHT
    );
  }

  private navigateMinimapTo(pointer: Phaser.Input.Pointer): void {
    const relX = Phaser.Math.Clamp(pointer.x - this.minimapX, 0, MINIMAP_WIDTH);
    const relY = Phaser.Math.Clamp(pointer.y - this.minimapY, 0, MINIMAP_HEIGHT);
    const worldX = (relX / MINIMAP_WIDTH) * MAP_WIDTH_TILES * TILE_SIZE;
    const worldY = (relY / MINIMAP_HEIGHT) * MAP_HEIGHT_TILES * TILE_SIZE;
    // Camera bounds set in buildTilemap() clamp the scroll automatically.
    this.cameras.main.centerOn(worldX, worldY);
    this.redrawMinimapViewportThrottled();
  }

  private setupBuildingPlacement(): void {
    this.input.mouse?.disableContextMenu();
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT) ?? null;

    gameEvents.on('select-building', (type: BuildingType) => {
      this.selectedType = type;
      this.refreshPreviewTexture();
    });

    gameEvents.on('cancel-placement', () => {
      this.cancelPlacement();
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      gameEvents.emit('cancel-placement');
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerInMinimap(pointer)) {
        return;
      }
      // Phase 65: setupTouchGestures' own pointerdown listener (registered
      // earlier in create()) has already flipped twoFingerGestureActive on by
      // the time this runs, the instant a second finger lands - a single-tap
      // placement must not fire off the finger that happens to complete the
      // pinch's pointerdown pair.
      if (this.twoFingerGestureActive) {
        return;
      }
      // Phase 65: touch produces no hover - pointermove only fires while a
      // finger is already down - so without this, the placement preview
      // (and its rejection-reason hint) would only appear after the finger
      // started moving, one full drag-distance late. Gated to wasTouch so
      // mouse behavior (which never called updatePreview from pointerdown)
      // is unaffected; a mouse's own hover already drives updatePreview via
      // pointermove well before any click.
      if (pointer.wasTouch && this.selectedType !== null) {
        this.updatePreview(pointer);
      }
      if (pointer.rightButtonDown()) {
        gameEvents.emit('cancel-placement');
        return;
      }
      // Phase 43: line-friendly types (Road/Fence) place on pointerup instead
      // (see commitLinePlacement below) so a plain click and a drag-to-line
      // can share one code path - committing immediately here would place a
      // building before we even know whether this click is about to become a
      // drag.
      if (
        this.selectedType !== null &&
        pointer.leftButtonDown() &&
        !isLinePlacementBuilding(this.selectedType)
      ) {
        this.tryPlaceAt(pointer);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Phase 65: a two-finger gesture ending must never be read as "commit
      // the line" - consumeTouchTapSuppression both checks and clears this
      // pointer's flag, so a later genuine single-finger tap isn't stuck
      // suppressed forever.
      if (this.consumeTouchTapSuppression(pointer)) {
        return;
      }
      if (
        this.selectedType === null ||
        !isLinePlacementBuilding(this.selectedType) ||
        !pointer.leftButtonReleased() ||
        this.isPointerInMinimap(pointer)
      ) {
        return;
      }
      this.commitLinePlacement(pointer);
    });
  }

  private setupBuildingSelection(): void {
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasMinimapClick = this.minimapPointerActive;
      this.minimapPointerActive = false;
      if (wasMinimapClick) {
        return;
      }

      // Phase 65: same two-finger-gesture-ending guard as the line-placement
      // commit above - a pinch/pan releasing must not be read as "tap to
      // select/deselect a building".
      if (this.consumeTouchTapSuppression(pointer)) {
        return;
      }

      if (this.selectedType !== null) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_THRESHOLD) {
        return;
      }

      const { tileX, tileY } = this.pointerToTile(pointer);
      const building = getBuildingAtTile(tileX, tileY);

      this.selectedBuildingId = building?.id ?? null;
      gameEvents.emit('building-selected', building);
    });

    // Keeps the tracked id in step with panel closes issued elsewhere
    // (game-reset, a removal closing the panel) without those paths needing
    // to know about this field.
    gameEvents.on('building-selected', (building: PlacedBuilding | null) => {
      this.selectedBuildingId = building?.id ?? null;
    });
  }

  private refreshPreviewTexture(): void {
    if (this.selectedType === null) {
      return;
    }

    this.previewImage?.destroy();
    this.previewImage = this.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(this.selectedType));
    this.previewImage.setOrigin(0, 0);
    this.previewImage.setAlpha(0.6);
    this.previewImage.setDepth(500);
  }

  private cancelPlacement(): void {
    this.selectedType = null;
    this.previewImage?.destroy();
    this.previewImage = null;
    this.placementHintText?.setVisible(false);
    this.hideLinePreview();
    this.lineDragWasActive = false;
  }

  /** Phase 43: hides every pooled line-preview tile plus the running cost tag; the pooled Images themselves are never destroyed, just reused next drag. */
  private hideLinePreview(): void {
    for (const image of this.linePreviewImages) {
      image.setVisible(false);
    }
    this.lineCostText?.setVisible(false);
  }

  private isShiftHeld(): boolean {
    return this.shiftKey?.isDown ?? false;
  }

  /**
   * Phase 43: placement previously always stayed active until an explicit
   * Escape/right-click cancel (see cancelPlacement's call sites), so a single
   * House click already behaved like "repeat placement" with no way to place
   * just one without a manual cancel afterwards. This flips the default to
   * match the literal ask ("shift-click keeps the tool active for repeat
   * placement"): a plain placement now exits placement mode immediately,
   * and holding Shift is what keeps it selected for the next tile/line.
   *
   * Emits 'cancel-placement' rather than calling this.cancelPlacement()
   * directly - BuildingBar's active-button highlight is driven purely by
   * that event (see its 'select-building'/'cancel-placement' listeners), so
   * calling the local cleanup straight would silently desync the bar from
   * the scene's actual placement state.
   */
  private applyShiftRepeatPolicy(): void {
    if (!this.isShiftHeld()) {
      gameEvents.emit('cancel-placement');
    }
  }

  /**
   * Phase 43: dominant-axis-first straight line from start to end, bending
   * once into an L rather than a staircase - the common RTS wall-drag
   * convention. rangeInclusive collapses to a single value when start===end
   * on that axis, and slice(1) on the second leg drops its first tile (the
   * corner), which the first leg already added - this also means a
   * zero-length drag (start === end on both axes) degrades to exactly one
   * tile, so a plain click without any drag still places a single building.
   */
  private computeLineTiles(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): { tileX: number; tileY: number }[] {
    const rangeInclusive = (from: number, to: number): number[] => {
      const step = from <= to ? 1 : -1;
      const values: number[] = [];
      for (let value = from; step > 0 ? value <= to : value >= to; value += step) {
        values.push(value);
      }
      return values;
    };

    const tiles: { tileX: number; tileY: number }[] = [];
    if (Math.abs(endX - startX) >= Math.abs(endY - startY)) {
      for (const x of rangeInclusive(startX, endX)) {
        tiles.push({ tileX: x, tileY: startY });
      }
      for (const y of rangeInclusive(startY, endY).slice(1)) {
        tiles.push({ tileX: endX, tileY: y });
      }
    } else {
      for (const y of rangeInclusive(startY, endY)) {
        tiles.push({ tileX: startX, tileY: y });
      }
      for (const x of rangeInclusive(startX, endX).slice(1)) {
        tiles.push({ tileX: x, tileY: endY });
      }
    }
    return tiles;
  }

  private worldToTile(worldX: number, worldY: number): { tileX: number; tileY: number } {
    return {
      tileX: Math.floor(worldX / TILE_SIZE),
      tileY: Math.floor(worldY / TILE_SIZE),
    };
  }

  private getOrCreateLinePreviewImage(index: number, type: BuildingType): Phaser.GameObjects.Image {
    const existing = this.linePreviewImages[index];
    if (existing) {
      existing.setTexture(BUILDING_ATLAS_KEY, buildingTextureKey(type));
      return existing;
    }
    const image = this.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(type));
    image.setOrigin(0, 0);
    image.setAlpha(0.6);
    image.setDepth(500);
    this.linePreviewImages[index] = image;
    return image;
  }

  /**
   * Phase 43: renders every tile of the in-progress line simultaneously
   * (green/red per tile via getPlacementRejection, same rule placeBuilding
   * itself gates on) plus a running "N/total Label - cost" tag near the
   * drag's current end. The single-tile hover preview (previewImage) is
   * hidden for the duration - see the pointermove branch in setupCameraDrag.
   */
  private updateLinePreview(pointer: Phaser.Input.Pointer): void {
    const type = this.selectedType;
    if (type === null) {
      return;
    }

    this.previewImage?.setVisible(false);

    const startTile = this.worldToTile(this.dragStartWorldX, this.dragStartWorldY);
    const endTile = this.pointerToTile(pointer);
    const tiles = this.computeLineTiles(startTile.tileX, startTile.tileY, endTile.tileX, endTile.tileY);
    const definition = BUILDING_DEFINITIONS[type];

    let validCount = 0;
    let totalMoney = 0;
    const totalMaterials: Partial<Record<ResourceKey, number>> = {};

    tiles.forEach((tile, index) => {
      const rejection = getPlacementRejection(tile.tileX, tile.tileY, type);
      const image = this.getOrCreateLinePreviewImage(index, type);
      image.setPosition(tile.tileX * TILE_SIZE, tile.tileY * TILE_SIZE);
      image.setVisible(true);
      image.setTint(rejection === null ? VALID_TINT : INVALID_TINT);

      if (rejection === null) {
        validCount++;
        totalMoney += definition.cost;
        if (definition.materials) {
          for (const [key, amount] of Object.entries(definition.materials) as [ResourceKey, number][]) {
            totalMaterials[key] = (totalMaterials[key] ?? 0) + amount;
          }
        }
      }
    });

    for (let index = tiles.length; index < this.linePreviewImages.length; index++) {
      this.linePreviewImages[index].setVisible(false);
    }

    const costLabel =
      Object.keys(totalMaterials).length > 0
        ? `$${totalMoney} + ${formatResourceMap(totalMaterials)}`
        : `$${totalMoney}`;
    const lastTile = tiles[tiles.length - 1];
    this.lineCostText.setText(`${validCount}/${tiles.length} ${definition.label} - ${costLabel}`);
    this.lineCostText.setPosition(
      lastTile.tileX * TILE_SIZE,
      (lastTile.tileY + definition.size.height) * TILE_SIZE + 4,
    );
    this.lineCostText.setVisible(true);
    this.placementHintText.setVisible(false);
    this.worldVisualsSystem.clearHarvestRing();
  }

  /**
   * Phase 43: places on every tile of the line that passes
   * getPlacementRejection AT THE TIME IT IS REACHED (not the preview's
   * earlier snapshot) - placeBuildingAt re-checks via placeBuilding/
   * canPlaceBuilding per tile, so money/materials spent on tile N are
   * already gone by the time tile N+1 is attempted. A drag that outruns the
   * player's money therefore just stops placing partway through rather than
   * aborting the whole line or overspending.
   */
  private commitLinePlacement(pointer: Phaser.Input.Pointer): void {
    const type = this.selectedType;
    if (type === null) {
      return;
    }

    const startTile = this.worldToTile(this.dragStartWorldX, this.dragStartWorldY);
    const endTile = this.pointerToTile(pointer);
    const tiles = this.computeLineTiles(startTile.tileX, startTile.tileY, endTile.tileX, endTile.tileY);

    let placedCount = 0;
    for (const tile of tiles) {
      if (this.placeBuildingAt(tile.tileX, tile.tileY)) {
        placedCount++;
      }
    }

    this.hideLinePreview();
    this.lineDragWasActive = false;

    if (placedCount > 0) {
      playPlacementSound();
    }

    this.applyShiftRepeatPolicy();
    if (this.selectedType !== null) {
      this.previewImage?.setVisible(true);
      this.updatePreview(pointer);
    }
  }

  /**
   * Phase 33: the preview no longer just goes red - it says why. The reason
   * string comes straight from gameState.getPlacementRejection, the same
   * function placeBuilding itself gates on, so the hint can never claim a
   * placement is legal (or illegal) when the rule disagrees.
   */
  private updatePreview(pointer: Phaser.Input.Pointer): void {
    if (this.selectedType === null || !this.previewImage) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    this.previewImage.setPosition(tileX * TILE_SIZE, tileY * TILE_SIZE);

    // Phase 34: a harvester's reach is drawn under the preview so "will this
    // actually reach anything" is answerable before paying for it.
    this.worldVisualsSystem.redrawHarvestRing(tileX, tileY);

    const rejection = getPlacementRejection(tileX, tileY, this.selectedType);
    this.previewImage.setTint(rejection === null ? VALID_TINT : INVALID_TINT);

    // Phase 34: a legal-but-unwise placement gets a warning rather than a
    // block. The tint stays green (it IS placeable) and only the hint text
    // changes colour, so the two signals can't be confused with each other.
    const warning = rejection === null ? getPlacementWarning(tileX, tileY, this.selectedType) : null;
    const message = rejection ?? warning;

    if (message === null) {
      this.placementHintText.setVisible(false);
      return;
    }

    const { height } = BUILDING_DEFINITIONS[this.selectedType].size;
    this.placementHintText.setText(message);
    this.placementHintText.setBackgroundColor(rejection === null ? '#8d6e00dd' : '#c62828dd');
    this.placementHintText.setPosition(
      tileX * TILE_SIZE,
      (tileY + height) * TILE_SIZE + 4,
    );
    this.placementHintText.setVisible(true);
  }

  /**
   * Phase 31: explicit bulldozer mode. Kept as a separate mode rather than a
   * button on the info panel so demolishing several buildings in a row
   * doesn't mean re-selecting each one first; selecting a building to place
   * cancels it (and vice versa) since the two modes both own the left click.
   */
  private setupDemolishMode(): void {
    gameEvents.on('demolish-mode-changed', (active: boolean) => {
      this.demolishMode = active;
      if (active) {
        this.cancelPlacement();
      }
    });

    gameEvents.on('select-building', () => {
      if (this.demolishMode) {
        this.demolishMode = false;
        gameEvents.emit('demolish-mode-changed', false);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.twoFingerGestureActive) {
        return;
      }
      if (!this.demolishMode || !pointer.leftButtonDown() || this.isPointerInMinimap(pointer)) {
        return;
      }
      const { tileX, tileY } = this.pointerToTile(pointer);
      const building = getBuildingAtTile(tileX, tileY);
      if (building) {
        demolishBuilding(building.id);
        return;
      }

      // Phase 34: the bulldozer now also clears a tree/cactus. Until now the
      // only thing that ever removed vegetation was a harvester draining it,
      // so a tile blocked by a species you had no harvester for could not be
      // built on at all - a genuine dead end, not a difficulty choice.
      // Buildings take priority on a shared tile (a building and vegetation
      // can't coexist today, but the ordering makes the intent explicit).
      const vegetation = getVegetationAtTile(tileX, tileY);
      if (vegetation && clearVegetationAt(tileX, tileY)) {
        playWorldSound('clear', tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2);
      } else if (vegetation) {
        this.showTransientHint(
          `Need $${VEGETATION_CLEAR_COST} to clear`,
          tileX * TILE_SIZE,
          (tileY + 1) * TILE_SIZE + 4,
        );
      }
    });
  }

  /** Reuses the placement hint text object for a brief, position-anchored message outside placement mode. */
  private showTransientHint(text: string, worldX: number, worldY: number): void {
    this.placementHintText.setText(text);
    this.placementHintText.setBackgroundColor('#c62828dd');
    this.placementHintText.setPosition(worldX, worldY);
    this.placementHintText.setVisible(true);
    this.time.delayedCall(1200, () => {
      if (this.selectedType === null) {
        this.placementHintText.setVisible(false);
      }
    });
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
      this.redrawMinimap();
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

  /**
   * Phase 43: extracted from tryPlaceAt so commitLinePlacement can call it
   * once per tile of a drag-line - returns whether a building was actually
   * placed (a tile failing getPlacementRejection just returns false, letting
   * the line skip it silently) rather than void, and deliberately does NOT
   * play the placement sound itself, since a multi-tile line plays it once
   * for the whole line instead of once per tile (see tryPlaceAt/
   * commitLinePlacement, the two callers).
   */
  private placeBuildingAt(tileX: number, tileY: number): boolean {
    if (this.selectedType === null) {
      return false;
    }

    const building = placeBuilding(tileX, tileY, this.selectedType);
    if (!building) {
      return false;
    }

    // A freshly placed Barracks/Horsery always starts with zero trained units
    // (see gameState.ts), so there is nothing to spawn here - Cowboy/mounted-
    // Cowboy units only ever appear via the 'cowboy-trained'/'mounted-cowboy-
    // trained' events. A loaded save's worldVisualsSystem.restoreBuildingVisual,
    // used elsewhere, is the one path that DOES need to spawn units up front
    // (a restored Barracks can already have a nonzero cowboyCount).
    this.worldVisualsSystem.createVisualForBuilding(building);
    // Phase 82: cull immediately so a building placed off-screen (e.g. the
    // far end of a drag-placed Road/Fence line) starts in the correct
    // visibility state rather than waiting for the next throttled tick.
    this.updateViewportCulling();
    return true;
  }

  private tryPlaceAt(pointer: Phaser.Input.Pointer): void {
    if (this.selectedType === null) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    if (!this.placeBuildingAt(tileX, tileY)) {
      return;
    }

    playPlacementSound();
    this.applyShiftRepeatPolicy();
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
   * Phase 53: Rally Points & Training Queue. The flag itself is drawn for
   * every Barracks/Horsery that currently has a rallyPoint set (not just the
   * selected one - unlike the harvest ring, a rally point is standing town
   * state a player wants to see at a glance, not a per-selection preview).
   * The "arm a pick" mode is a separate concern from drawing: it's a single
   * scalar (rallyPointModeBuildingId) consumed by setupUnitControl's
   * pointerup handler, with its own hint text mirroring
   * cowboySelectionHintText's bottom-anchored style.
   */
  private setupRallyPoints(): void {
    this.rallyPointGraphics = this.add.graphics().setDepth(RALLY_POINT_DEPTH);
    this.rallyPointModeHintText = this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 8, 'Right-click the ground to set the rally point', {
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#2b1d12cc',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.registerUiObject(this.rallyPointModeHintText);

    gameEvents.on('rally-point-mode-changed', (buildingId: string | null) => {
      this.rallyPointModeBuildingId = buildingId;
      this.rallyPointModeHintText.setVisible(buildingId !== null);
    });
    gameEvents.on('rally-point-changed', () => this.redrawRallyPoints());
    gameEvents.on('building-removed', () => this.redrawRallyPoints());
    gameEvents.on('game-loaded', () => this.redrawRallyPoints());
    gameEvents.on('game-reset', () => {
      this.rallyPointGraphics.clear();
      this.cancelRallyPointMode();
    });
    // A different building's info panel opening, entering placement mode, or
    // entering demolish mode all cancel an armed pick - the same
    // mode-exclusivity rule setupDemolishMode already applies to itself.
    gameEvents.on('building-selected', (building: PlacedBuilding | null) => {
      if (this.rallyPointModeBuildingId !== null && building?.id !== this.rallyPointModeBuildingId) {
        this.cancelRallyPointMode();
      }
    });
    gameEvents.on('select-building', () => this.cancelRallyPointMode());
    gameEvents.on('demolish-mode-changed', (active: boolean) => {
      if (active) {
        this.cancelRallyPointMode();
      }
    });
  }

  private cancelRallyPointMode(): void {
    if (this.rallyPointModeBuildingId === null) {
      return;
    }
    this.rallyPointModeBuildingId = null;
    this.rallyPointModeHintText.setVisible(false);
    gameEvents.emit('rally-point-mode-changed', null);
  }

  private redrawRallyPoints(): void {
    this.rallyPointGraphics.clear();
    for (const building of getPlacedBuildings()) {
      if (building.rallyPoint) {
        this.drawRallyFlag(building.rallyPoint.x, building.rallyPoint.y);
      }
    }
  }

  private drawRallyFlag(x: number, y: number): void {
    const topY = y - RALLY_POINT_POLE_HEIGHT_PX;
    this.rallyPointGraphics.lineStyle(2, RALLY_POINT_POLE_COLOR, 1);
    this.rallyPointGraphics.lineBetween(x, y, x, topY);
    this.rallyPointGraphics.fillStyle(RALLY_POINT_FLAG_COLOR, 1);
    this.rallyPointGraphics.fillTriangle(
      x,
      topY,
      x,
      topY + RALLY_POINT_FLAG_HEIGHT_PX,
      x + RALLY_POINT_FLAG_WIDTH_PX,
      topY + RALLY_POINT_FLAG_HEIGHT_PX / 2,
    );
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

      this.cancelPlacement();
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

  /**
   * Phase 69: the 'G' hotkey and the building bar's "Close/Open All Gates"
   * button both call this - majority-state-derived rather than a separately
   * tracked local toggle flag, so it stays correct after a load/reset or
   * after any single gate was already toggled individually via the info
   * panel (a local "last commanded state" flag could silently disagree with
   * what's actually on the map). If any WoodenGate is currently open, this
   * closes every gate (the more defensive default when the player's intent
   * is ambiguous); only when every gate is already closed does it open them
   * all.
   */
  private toggleAllGates(): void {
    const gates = getPlacedBuildings().filter((building) => building.type === BuildingType.WoodenGate);
    if (gates.length === 0) {
      return;
    }
    const anyOpen = gates.some((gate) => gate.gateOpen !== false);
    setAllGates(!anyOpen);
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
      this.issueUnitMoveOrder(unit, building.rallyPoint.x, building.rallyPoint.y);
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
   * Registers unit selection and move orders (both on pointerup - Phase 25
   * moved move orders off pointerdown, see below) as their own listener
   * rather than folding them into setupBuildingPlacement/setupBuildingSelection.
   * Phaser fires every listener registered for the same event, in
   * registration order, so this coexists safely with the existing handlers:
   * emitting 'cancel-placement' on right pointerdown while selectedType is
   * already null (setupBuildingPlacement's rightButtonDown branch) is a
   * verified no-op (see cancelPlacement), and the minimap guard here is
   * re-checked directly via isPointerInMinimap(pointer) rather than trusting
   * this.minimapPointerActive, since setupBuildingSelection's own pointerup
   * handler (registered earlier) already resets that flag to false by the
   * time this one runs.
   *
   * Phase 24 issued the move order on pointerdown (right button), which
   * worked for single-click-to-move but can't distinguish a right-click from
   * the start of a right-drag-to-pan (Phase 25). Both selection and move
   * orders now resolve on pointerup, gated on which button was just released
   * (leftButtonReleased()/rightButtonReleased()) and on the same
   * click-vs-drag distance threshold used everywhere else in this file - a
   * right release past the threshold was a pan, not a command.
   *
   * Left-click selection intentionally does NOT suppress the existing
   * building-info-panel click handling - both fire on the same click. Picking
   * a unit is a separate, additive concern from building selection; a player
   * clicking a unit standing on/near a building plausibly wants to see both,
   * and suppressing one would just be a surprising special case.
   */
  private setupUnitControl(): void {
    this.selectionRingGraphics = this.add.graphics().setDepth(COWBOY_SELECTION_RING_DEPTH);
    this.selectionRectGraphics = this.add.graphics().setDepth(SELECTION_RECT_DEPTH);

    this.cowboySelectionHintText = this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 8, 'Unit(s) selected - right-click to move', {
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#2b1d12cc',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.registerUiObject(this.cowboySelectionHintText);

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // The drag rectangle (if any) always ends here, regardless of which
      // guard below fires next, so no stray box can ever outlive its drag.
      this.selectionRectGraphics.clear();

      // Phase 65: a pinch/pan gesture ending must never be read as a unit
      // command, a rally-point pick, or a selection change - checked (and
      // cleared) before every other branch below, mirroring the same guard
      // added to setupBuildingPlacement/setupBuildingSelection's pointerup
      // handlers.
      if (this.consumeTouchTapSuppression(pointer)) {
        return;
      }

      if (this.selectedType !== null || this.isPointerInMinimap(pointer)) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);
      // Phase 63: resolved once through the main camera and reused by every
      // branch below - pointer.worldX/Y is unreliable with a second camera in
      // play (see pointerWorldPoint).
      const world = this.pointerWorldPoint(pointer);

      if (pointer.rightButtonReleased()) {
        this.resolveRallyOrCommandOrder(pointer, world, dragDistance);
        return;
      }

      if (!pointer.leftButtonReleased()) {
        return;
      }

      // Phase 65: single-finger tap-to-order, mode-aware. A plain left-click
      // release on desktop (mouse) still ONLY selects/box-selects, exactly as
      // before - this branch is gated on the release having come from a touch
      // pointer specifically, so mouse behavior is untouched byte-for-byte.
      // See resolveTouchTapAction's own doc comment for the full precedence
      // rule (rally-pick > select-a-unit > raider/camp/move-order). An armed
      // rally-point pick (item 3 of the phase spec) is reachable via touch
      // even with zero units selected - it's a building-mode action, not a
      // unit-order one - so it's checked here independently of
      // selectedUnits.length rather than folded into that same guard.
      if (pointer.wasTouch && dragDistance <= CLICK_MOVE_THRESHOLD && !this.demolishMode) {
        if (this.rallyPointModeBuildingId !== null) {
          this.resolveRallyOrCommandOrder(pointer, world, dragDistance);
          return;
        }
        if (this.selectedUnits.length > 0) {
          this.resolveTouchTapAction(pointer, world, dragDistance);
          return;
        }
      }

      if (dragDistance <= CLICK_MOVE_THRESHOLD) {
        this.selectUnitAt(pointer);
      } else {
        this.selectUnitsInRect(this.dragStartWorldX, this.dragStartWorldY, world.x, world.y);
      }
    });
  }

  /**
   * Phase 65: the right-click-release command chain, extracted verbatim out
   * of setupUnitControl's pointerup handler so touch's single-finger-tap
   * order (resolveTouchTapAction) can call the exact same raider/camp/
   * move-order resolution instead of a second copy. Behavior for the mouse
   * right-click caller is completely unchanged - this is a pure extraction,
   * not a rewrite.
   */
  private resolveRallyOrCommandOrder(
    pointer: Phaser.Input.Pointer,
    world: Phaser.Math.Vector2,
    dragDistance: number,
  ): void {
    // Phase 53: an armed rally-point pick takes over this right-click
    // entirely, ahead of the unit move/attack-order logic below - a
    // qualifying click (not a right-drag pan past the threshold) sets the
    // rally point and disarms; anything else (a pan) leaves the mode
    // armed for a later attempt.
    if (this.rallyPointModeBuildingId !== null) {
      if (dragDistance <= CLICK_MOVE_THRESHOLD) {
        setRallyPoint(this.rallyPointModeBuildingId, world.x, world.y);
        gameEvents.emit('rally-point-mode-changed', null);
      }
      return;
    }

    if (dragDistance > CLICK_MOVE_THRESHOLD || this.selectedUnits.length === 0) {
      return;
    }
    // Phase 40: right-clicking directly on a live raider issues a focus-fire
    // attack order on that specific raider instead of a plain move order;
    // Phase 57 extends the same hit-test to a live Raider Camp (checked
    // second - a raider standing in front of its own camp still wins);
    // Phase 71 extends it a third time to wildlife (checked last); right-
    // clicking anything else (empty ground, a building, etc.) keeps the
    // original move-order behavior unchanged.
    const raider = this.findRaiderAt(world.x, world.y);
    if (raider) {
      this.issueUnitAttackOrder({ kind: 'raider', id: raider.id }, { x: raider.image.x, y: raider.image.y });
      return;
    }
    const camp = this.findCampAt(world.x, world.y);
    if (camp) {
      this.issueUnitAttackOrder({ kind: 'camp', id: camp.id }, { x: camp.x, y: camp.y });
      return;
    }
    const creature = this.ambientLifeSystem.findWildlifeAt(world.x, world.y);
    if (creature) {
      this.issueUnitAttackOrder(
        { kind: 'wildlife', id: creature.id },
        { x: creature.image.x, y: creature.image.y },
      );
    } else {
      this.issueUnitMoveOrders(pointer);
    }
  }

  /**
   * Phase 65: a single-finger TAP (drag distance <= CLICK_MOVE_THRESHOLD)
   * with units currently selected AND no armed rally-point pick (that case is
   * intercepted one level up, in setupUnitControl's pointerup handler, before
   * this is ever called - see its own comment). Only reachable with
   * pointer.wasTouch - mouse left-clicks never call this, so desktop behavior
   * is unaffected.
   *
   * Precedence (documented per the phase spec):
   * 1. An armed rally-point pick wins outright (handled by the caller, ahead
   *    of this method - not repeated here to avoid two sources of truth for
   *    the same branch).
   * 2. Otherwise, if the tap hits a LIVE UNIT (findAliveUnitAt, using the
   *    same COWBOY_SELECT_HIT_RADIUS_PX selectUnitAt already hit-tests
   *    against - practical because it's a generous 10px radius, roughly a
   *    fingertip's worth of slop at this game's zoom range), selecting that
   *    unit wins over issuing an order onto it. Without this rule a touch
   *    player could tap a second unit while one is already selected and
   *    NEVER change their selection - every tap would be interpreted as a
   *    move/attack order onto the point they were trying to select at,
   *    a genuine dead end this phase's brief explicitly calls out.
   * 3. Only a tap that hits no unit falls through to the shared raider/camp/
   *    move-order chain - the same deselect-by-tapping-empty-ground-issues-a-
   *    move-order behavior the brief accepts as the intended escape hatch
   *    (Escape/re-opening the building/placement UI already clears unit
   *    selection elsewhere).
   */
  private resolveTouchTapAction(
    pointer: Phaser.Input.Pointer,
    world: Phaser.Math.Vector2,
    dragDistance: number,
  ): void {
    const hitUnit = this.findAliveUnitAt(world.x, world.y);
    if (hitUnit) {
      this.selectUnitAt(pointer);
      return;
    }

    this.resolveRallyOrCommandOrder(pointer, world, dragDistance);
  }

  /**
   * Phase 41: a second click-select on the SAME unit within
   * UNIT_DOUBLE_CLICK_MS selects every currently-alive unit of that unit's
   * kind (cowboy vs cowboyOnHorse) rather than just the one clicked -
   * "every alive" rather than "every on-screen" since it's simpler and reads
   * correctly (a player double-clicking one Cowboy almost always wants every
   * Cowboy, on-screen or not).
   */
  private selectUnitAt(pointer: Phaser.Input.Pointer): void {
    const world = this.pointerWorldPoint(pointer);
    const hit = this.findAliveUnitAt(world.x, world.y);

    if (!hit) {
      this.selectedUnits = [];
      this.lastUnitClickId = null;
      this.cowboySelectionHintText.setVisible(false);
      return;
    }

    const now = this.time.now;
    const isDoubleClick = hit.id === this.lastUnitClickId && now - this.lastUnitClickAt <= UNIT_DOUBLE_CLICK_MS;
    this.lastUnitClickId = hit.id;
    this.lastUnitClickAt = now;

    this.selectedUnits = isDoubleClick
      ? this.cowboyUnits.filter((unit) => unit.kind === hit.kind && this.isCowboyUnitAlive(unit))
      : [hit];
    this.cowboySelectionHintText.setVisible(true);
  }

  /** Every living unit whose position falls within the released drag rectangle (world-space corners, order-independent). */
  private selectUnitsInRect(x1: number, y1: number, x2: number, y2: number): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    this.selectedUnits = this.cowboyUnits.filter(
      (unit) =>
        this.isCowboyUnitAlive(unit) &&
        unit.image.x >= minX &&
        unit.image.x <= maxX &&
        unit.image.y >= minY &&
        unit.image.y <= maxY,
    );
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /**
   * One move order per selected unit, each aimed at the click point plus a
   * small random offset so a multi-unit order doesn't stack every unit on one
   * pixel. Note this is Phase 40's "attack-move" too, not just a plain move:
   * resolveCowboyFire reads each unit's live image.x/y (kept current by
   * Phaser's own tween stepping, independent of the 2s combat-tick timer)
   * rather than only checking position once a tween completes, so a unit
   * already auto-fires at whatever's nearest-in-range while mid-walk to this
   * order's destination. A separate attack-move keybind would just be this
   * same behavior under a second name, so none was added.
   */
  private issueUnitMoveOrders(pointer: Phaser.Input.Pointer): void {
    // One confirmation per order, not per unit - a 5-unit order is still a
    // single player action.
    playUiSound('moveConfirm');
    const world = this.pointerWorldPoint(pointer);
    for (const unit of this.selectedUnits) {
      // An explicit new move order supersedes any standing attack order -
      // otherwise resolveUnitAttackOrders would immediately start steering
      // the unit back toward its old target on the next combat tick.
      unit.attackTarget = null;
      const jitterX = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      const jitterY = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      this.issueUnitMoveOrder(unit, world.x + jitterX, world.y + jitterY);
    }
  }

  /**
   * Nearest currently-alive CombatUnit to a world point within
   * COWBOY_SELECT_HIT_RADIUS_PX, or null. Extracted out of selectUnitAt
   * (Phase 65) so the touch tap-order path can run the same "did this tap
   * actually hit one of my own units" check selectUnitAt uses, without
   * duplicating the loop - see resolveTouchTapAction's doc comment for why
   * that check has to happen before the raider/camp/move-order chain.
   */
  private findAliveUnitAt(worldX: number, worldY: number): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestDistance = COWBOY_SELECT_HIT_RADIUS_PX;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(worldX, worldY, unit.image.x, unit.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = unit;
      }
    }

    return best;
  }

  /** Nearest live raider to a world point within RAIDER_ATTACK_HIT_RADIUS_PX, or null - the hit-test that tells a right-click-on-a-raider (attack order) apart from a right-click-on-ground (move order). Phase 85: delegates to RaidSystem, which owns the raiders array. */
  private findRaiderAt(worldX: number, worldY: number): Raider | null {
    return this.raidSystem.findRaiderAt(worldX, worldY);
  }

  /** Nearest live Raider Camp to a world point within RAIDER_CAMP_ATTACK_HIT_RADIUS_PX, or null - mirrors findRaiderAt exactly, checked second in the pointerup handler so an overlapping raider always wins the hit-test. Phase 85: delegates to RaidSystem. */
  private findCampAt(worldX: number, worldY: number): RaiderCamp | null {
    return this.raidSystem.findCampAt(worldX, worldY);
  }

  /**
   * Phase 40: locks every selected unit onto one specific raider (or, Phase
   * 57, Raider Camp) by AttackTargetRef. Unlike a plain move order, this
   * survives across combat ticks (resolveUnitAttackOrders re-issues the
   * approach each tick and resolveCowboyFire focus-fires this target
   * specifically once in range) until the target dies/is destroyed or
   * otherwise stops being found alive, at which point the unit falls back to
   * auto-targeting raiders on its own. `position` is the target's current
   * world position at order time, used only for the immediate approach-or-
   * engage feedback below - every later tick re-resolves it fresh via
   * getAttackTargetPosition instead of trusting this snapshot.
   */
  private issueUnitAttackOrder(target: AttackTargetRef, position: { x: number; y: number }): void {
    // Same one-confirmation-per-order rule as issueUnitMoveOrders.
    playUiSound('moveConfirm');
    for (const unit of this.selectedUnits) {
      unit.attackTarget = target;
      this.approachOrEngageTarget(unit, position);
    }
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
  private approachOrEngageTarget(unit: CombatUnit, position: { x: number; y: number }): void {
    const rangePx = UNIT_KIND_CONFIG[unit.kind].rangeTiles * TILE_SIZE;
    const distance = Phaser.Math.Distance.Between(unit.image.x, unit.image.y, position.x, position.y);
    if (distance <= rangePx) {
      unit.moveTween?.stop();
      unit.moveTween = null;
      return;
    }
    this.issueUnitMoveOrder(unit, position.x, position.y);
  }

  /**
   * Phase 63: Roads & Logistics' own +10% PRODUCTION bonus (BFS road-network
   * connectivity) is untouched by this - a separate, additive check for unit
   * MOVEMENT speed. Deliberately cheap and one-shot (per CLAUDE.md's
   * performance rules against heavy per-frame/update-loop work): samples a
   * handful of points along the straight-line path at move-order-issue time
   * only, same half-tile-step technique sampleForBlockingWall already uses
   * for raider wall detection, and never rechecked again while the tween
   * runs - a unit doesn't "enter"/"exit" road speed mid-tween, the whole leg
   * is either road-sped or not.
   */
  private isPathMostlyOnRoad(x1: number, y1: number, x2: number, y2: number): boolean {
    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(distance / (TILE_SIZE / 2)));
    let onRoadCount = 0;
    let sampleCount = 0;

    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const sampleTileX = Math.floor((x1 + (x2 - x1) * t) / TILE_SIZE);
      const sampleTileY = Math.floor((y1 + (y2 - y1) * t) / TILE_SIZE);
      sampleCount++;

      const building = getBuildingAtTile(sampleTileX, sampleTileY);
      if (building && building.type === BuildingType.Road && building.hp > 0) {
        onRoadCount++;
      }
    }

    return sampleCount > 0 && onRoadCount / sampleCount >= ROAD_UNIT_SPEED_SAMPLE_THRESHOLD;
  }

  /** Same point-to-point tween technique as villagers/raiders (distance/speed -> duration, setFlipX for facing), clamped to map bounds. */
  private issueUnitMoveOrder(unit: CombatUnit, targetWorldX: number, targetWorldY: number): void {
    const targetX = Phaser.Math.Clamp(targetWorldX, 0, MAP_WIDTH_TILES * TILE_SIZE);
    const targetY = Phaser.Math.Clamp(targetWorldY, 0, MAP_HEIGHT_TILES * TILE_SIZE);

    unit.moveTween?.stop();
    unit.image.setFlipX(targetX < unit.image.x);

    const distance = Phaser.Math.Distance.Between(unit.image.x, unit.image.y, targetX, targetY);
    const onRoad = this.isPathMostlyOnRoad(unit.image.x, unit.image.y, targetX, targetY);
    const effectiveSpeed =
      UNIT_KIND_CONFIG[unit.kind].walkSpeedPxPerSec * (onRoad ? ROAD_UNIT_SPEED_MULTIPLIER : 1);
    const duration = (distance / effectiveSpeed) * 1000;

    unit.moveTween = this.tweens.add({
      targets: unit.image,
      x: targetX,
      y: targetY,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        unit.moveTween = null;
      },
    });
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

  /**
   * Phase 41: everything that isn't continuous camera panning (that's
   * setupKeyboardCamera/updateKeyboardCameraPan above) - control groups,
   * idle-unit cycling, demolishing the selected building, and the
   * bare-number-key building-category switch. One raw 'keydown' listener
   * (rather than addKey() per key) because several of these need modifier
   * state (event.ctrlKey) and a native KeyCode, not just "is this key down".
   *
   * Conflict resolution for bare digit keys 1-9 (documented once, here,
   * since handleNumberKey is the single place that arbitrates it): a digit
   * key ALWAYS tries a control-group recall first. Only if that group has no
   * living members (including a never-assigned group) does the key fall
   * through to the building-category tab switch, and only then if no units
   * are currently selected and neither placement nor demolish mode is
   * active. This means an assigned, still-living control group takes
   * permanent priority over that same digit's category tab - a deliberate
   * choice, since a group the player bothered to assign is presumably more
   * important than a tab shortcut sharing its digit.
   */
  private setupHotkeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (digitMatch) {
        this.handleNumberKey(Number(digitMatch[1]), event.ctrlKey || event.metaKey);
        event.preventDefault();
        return;
      }

      if (event.code === 'Space') {
        this.cycleIdleUnitSelection();
        event.preventDefault();
        return;
      }

      if (event.code === 'Delete' || event.code === 'Backspace') {
        this.demolishSelectedBuilding();
        event.preventDefault();
      }

      if (event.code === 'KeyC') {
        this.worldVisualsSystem.toggleChainViewVisibility();
        event.preventDefault();
      }

      // Phase 49: 'V' ("view stats") toggles the Statistics & Efficiency
      // panel. MainScene owns no state for it - the panel itself is the only
      // listener - so this is a bare emit, same shape as the 'C' hotkey above.
      if (event.code === 'KeyV') {
        gameEvents.emit('toggle-statistics-panel');
        event.preventDefault();
      }

      // Real Fence Enclosures: 'E' ("enclosure") toggles the debug overlay
      // showing every farm's cached enclosure state. Unlike 'C'/'V' this is a
      // local toggle (the overlay is drawn straight onto the world, not a
      // separate panel), so it calls WorldVisualsSystem's method rather than
      // emitting a bare event.
      if (event.code === 'KeyE') {
        this.worldVisualsSystem.toggleEnclosureDebugOverlay();
        event.preventDefault();
      }

      // Phase 64: 'H' (or '?', the conventional help key - Slash carries it
      // on most layouts) toggles the hotkey/resource-chain reference. Bare
      // emit like 'C'/'V': HelpOverlay owns all of its own state. Neither key
      // was previously bound (checked against WASD/arrows, Shift, digits 1-9,
      // Space, Delete/Backspace, C, V, E and Esc).
      if (event.code === 'KeyH' || event.code === 'Slash') {
        gameEvents.emit('toggle-help-overlay');
        event.preventDefault();
      }

      // Phase 69: 'G' ("gates") toggles every placed WoodenGate open/closed
      // in one press - see toggleAllGates's own doc comment for the
      // majority-state logic. Confirmed unbound before adding: grepped
      // setupHotkeys for every existing event.code branch (WASD/arrows via
      // the separate cameraKeys record, Shift, digit 1-9, Space, Delete/
      // Backspace, C, V, E, H/Slash) - none use KeyG.
      if (event.code === 'KeyG') {
        this.toggleAllGates();
        event.preventDefault();
      }
    });
  }

  private handleNumberKey(groupNumber: number, ctrlHeld: boolean): void {
    if (ctrlHeld) {
      if (this.selectedUnits.length === 0) {
        return;
      }
      this.controlGroups.set(groupNumber, this.selectedUnits.map((unit) => unit.id));
      return;
    }

    const memberIds = this.controlGroups.get(groupNumber);
    const livingMembers = memberIds
      ? this.cowboyUnits.filter((unit) => memberIds.includes(unit.id) && this.isCowboyUnitAlive(unit))
      : [];

    if (livingMembers.length > 0) {
      const now = this.time.now;
      const lastRecallAt = this.lastGroupRecallAt.get(groupNumber) ?? -Infinity;
      this.lastGroupRecallAt.set(groupNumber, now);

      this.selectedUnits = livingMembers;
      this.cowboySelectionHintText.setVisible(true);

      if (now - lastRecallAt <= CONTROL_GROUP_DOUBLE_TAP_MS) {
        this.centerCameraOnUnits(livingMembers);
      }
      return;
    }

    if (this.selectedUnits.length === 0 && this.selectedType === null && !this.demolishMode) {
      this.trySwitchBuildingCategory(groupNumber);
    }
  }

  private centerCameraOnUnits(units: CombatUnit[]): void {
    const avgX = units.reduce((sum, unit) => sum + unit.image.x, 0) / units.length;
    const avgY = units.reduce((sum, unit) => sum + unit.image.y, 0) / units.length;
    this.centerCameraOnWorldPoint(avgX, avgY);
  }

  /**
   * Phase 44: generalized single-point version of centerCameraOnUnits' own
   * centerOn-then-redraw-minimap-viewport pair, so the notification log's
   * click-to-focus (which has one world point, not a unit list to average)
   * doesn't need its own copy of the same two lines.
   */
  private centerCameraOnWorldPoint(worldX: number, worldY: number): void {
    this.cameras.main.centerOn(worldX, worldY);
    this.redrawMinimapViewportThrottled();
  }

  /** Phase 44: NotificationLogPanel (a DOM overlay with no camera access) asks to pan here via gameEvents rather than duplicating tile->world math. */
  private setupNotificationLog(): void {
    gameEvents.on('camera-focus-requested', (worldX: number, worldY: number) => {
      this.centerCameraOnWorldPoint(worldX, worldY);
    });
  }

  /** 1-indexed against BuildingCategory's declaration order (BuildingBar builds its tabs off the same Object.values(...) order); out-of-range numbers beyond the current category count are simply a no-op. */
  private trySwitchBuildingCategory(oneIndexedCategoryNumber: number): void {
    const categories = Object.values(BuildingCategory);
    const category = categories[oneIndexedCategoryNumber - 1];
    if (!category) {
      return;
    }
    gameEvents.emit('select-category', category);
  }

  /**
   * Cycles selection through units with no standing order (not mid-move-tween
   * and no attackTarget), centering the camera on each in turn and
   * wrapping around. If exactly one idle unit is already selected, this
   * advances from its position in the idle list; any other selection state
   * (none, multiple, or a non-idle unit) restarts from the first idle unit.
   */
  private cycleIdleUnitSelection(): void {
    const idleUnits = this.cowboyUnits.filter(
      (unit) => this.isCowboyUnitAlive(unit) && unit.moveTween === null && unit.attackTarget === null,
    );
    if (idleUnits.length === 0) {
      return;
    }

    const currentIndex = this.selectedUnits.length === 1 ? idleUnits.indexOf(this.selectedUnits[0]) : -1;
    const nextUnit = idleUnits[(currentIndex + 1) % idleUnits.length];

    this.selectedUnits = [nextUnit];
    this.cowboySelectionHintText.setVisible(true);
    this.cameras.main.centerOn(nextUnit.image.x, nextUnit.image.y);
    this.redrawMinimapViewportThrottled();
  }

  /** Mirrors BuildingInfoPanel's own Demolish button (demolishBuilding + clearing the selection), just bound to Delete/Backspace on whichever building is currently selected. No-op if nothing is selected. */
  private demolishSelectedBuilding(): void {
    if (!this.selectedBuildingId) {
      return;
    }
    demolishBuilding(this.selectedBuildingId);
    gameEvents.emit('building-selected', null);
  }

  private setupGameReset(): void {
    gameEvents.on('game-reset', () => {
      this.cancelPlacement();
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
      this.controlGroups.clear();
      this.lastGroupRecallAt.clear();
      this.lastUnitClickId = null;
      this.selectionRingGraphics.clear();
      this.selectionRectGraphics.clear();
      this.cowboySelectionHintText.setVisible(false);
      this.placementHintText.setVisible(false);

      this.raidSystem.resetRaiderCampVisuals();
      this.redrawMinimap();

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
      this.redrawMinimap();
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

  private pointerToTile(pointer: Phaser.Input.Pointer): { tileX: number; tileY: number } {
    const world = this.pointerWorldPoint(pointer);
    return {
      tileX: Math.floor(world.x / TILE_SIZE),
      tileY: Math.floor(world.y / TILE_SIZE),
    };
  }
}
