import Phaser from 'phaser';
import type { BuildingCategory, BuildingType, PlacedBuilding, ResourceKey } from '../config/buildingConfig';
import type { DayPhaseChange, GameOverSummary, Resources } from './gameState';
import type { NotificationEntry } from './notifications';
import type { VegetationEntity } from './vegetation';
import type { DurationWorldEventType, WorldEventType } from './worldEvents';

/**
 * Phase 31: why a building left the world. The visual side reacts
 * differently to each (a destroyed building gets the shake/dust death
 * animation, a demolished one just disappears with its refund), but both run
 * through the exact same state-side removal path.
 */
export type BuildingRemovalReason = 'destroyed' | 'demolished';

export interface BuildingRemovedPayload {
  building: PlacedBuilding;
  reason: BuildingRemovalReason;
}

/** Phase 46: fired by gameState's runHouseNeeds whenever a House's hysteresis counter actually flips its tier. */
export interface HouseTierChangePayload {
  building: PlacedBuilding;
  direction: 'upgrade' | 'downgrade';
}

export interface GameEventMap {
  'select-building': (type: BuildingType) => void;
  'cancel-placement': () => void;
  'money-changed': (money: number) => void;
  'building-placed': (building: PlacedBuilding) => void;
  'resources-changed': (resources: Resources) => void;
  'production-tick': () => void;
  'building-selected': (building: PlacedBuilding | null) => void;
  'connections-updated': () => void;
  'timer-changed': (remainingSeconds: number) => void;
  'game-over': (summary: GameOverSummary) => void;
  'game-reset': () => void;
  'animal-bought': (building: PlacedBuilding) => void;
  'cowboy-trained': (building: PlacedBuilding) => void;
  'mounted-cowboy-trained': (building: PlacedBuilding) => void;
  /** Phase 58: fired by gameState's runTrainingQueues on a completed Brawler/Dynamiter job, mirroring 'cowboy-trained'/'mounted-cowboy-trained' exactly - MainScene spawns the garrisoned unit's visual from it. */
  'brawler-trained': (building: PlacedBuilding) => void;
  'dynamiter-trained': (building: PlacedBuilding) => void;
  'building-removed': (payload: BuildingRemovedPayload) => void;
  'building-repaired': (building: PlacedBuilding) => void;
  'vegetation-added': (entity: VegetationEntity) => void;
  'vegetation-removed': (entity: VegetationEntity) => void;
  'demolish-mode-changed': (active: boolean) => void;
  'speed-changed': (speed: number) => void;
  'building-icons-ready': () => void;
  /** Phase 34: fired on every day->night / night->day boundary (and on reset). */
  'day-phase-changed': (change: DayPhaseChange) => void;
  /** Phase 34: audio master mute/volume, owned by the audio engine, driven from the building bar. Phase 59 added the independent music-bus volume alongside it. */
  'audio-settings-changed': (settings: { muted: boolean; volume: number; musicVolume: number }) => void;
  /**
   * Phase 39: GameOverOverlay's Play Again button no longer calls resetGame()
   * directly with whatever difficulty/mode the last run used - it emits this,
   * and DifficultySelectOverlay is what re-opens itself and eventually calls
   * resetGame with the player's freshly chosen settings.
   */
  'request-run-restart': () => void;
  /** Phase 41: fired by MainScene's bare-number-key building-category hotkey; BuildingBar is the only listener. */
  'select-category': (category: BuildingCategory) => void;
  /** Phase 44: a new entry was appended to the notification log (see state/notifications.ts); NotificationLogPanel is the only listener. */
  'notification-added': (entry: NotificationEntry) => void;
  /**
   * Phase 44: NotificationLogPanel is a DOM overlay with no camera of its
   * own, so a clicked log entry with a `buildingId` asks MainScene (the only
   * listener) to pan there instead of duplicating tile->world math in the
   * panel.
   */
  'camera-focus-requested': (worldX: number, worldY: number) => void;
  /** Phase 46: a House's tier just flipped (see runHouseNeeds); MainScene swaps its sprite frame, BuildingInfoPanel/HUD pick up the new population/tax on their next render. */
  'house-tier-changed': (payload: HouseTierChangePayload) => void;
  /**
   * Phase 48: fired by ResourceHudPanel when a resource icon is clicked
   * (toggling selection) and by MainScene's Escape/'C' handling for the same
   * selection - MainScene listens to redraw the chain-view map highlight,
   * ResourceHudPanel listens to itself so an external clear (Escape) keeps its
   * own icon-highlight state in sync. `null` clears the selection.
   */
  'resource-selected': (key: ResourceKey | null) => void;
  /**
   * Phase 49: toggles the Statistics & Efficiency panel's visibility. Fired by
   * MainScene's 'V' hotkey and by BuildingBar's "Stats" button; the panel
   * itself owns its shown/hidden state and is the only listener, matching how
   * 'toggle-chain-view'-style UI toggles elsewhere stay self-contained.
   */
  'toggle-statistics-panel': () => void;
  /**
   * Phase 52: fired once, after a loaded save has fully repopulated gameState
   * (buildings/vegetation/market/resources/clock all restored) but before
   * `updateConnections()` runs - MainScene is the only listener, and it
   * synchronously (re)creates every building/villager/garrisoned-unit visual
   * from `getPlacedBuildings()` so that the subsequent `connections-updated`
   * (from `updateConnections()`) has a fully-populated `buildingVisuals` map
   * to draw outlines/fence-lines against. Distinct from 'game-reset' (which
   * fires earlier in the same load, wiping the *previous* run's visuals) -
   * this is the "and now build the new ones" half.
   */
  'game-loaded': () => void;
  /** Phase 53: fired by gameState's setRallyPoint/clearRallyPoint whenever a Barracks/Horsery's rally point changes; MainScene redraws the flag marker, BuildingInfoPanel re-renders if that building is selected. */
  'rally-point-changed': (building: PlacedBuilding) => void;
  /**
   * Phase 53: BuildingInfoPanel's "Set Rally Point" button arms a one-shot
   * "next qualifying right-click on the ground sets this building's rally
   * point" mode - `buildingId` is which building will receive it, `null`
   * disarms (fired again by MainScene itself once the click lands, or by
   * cancellation paths mirroring how demolish-mode-changed is cancelled by
   * placement/selection).
   */
  'rally-point-mode-changed': (buildingId: string | null) => void;
  /**
   * Phase 55: Random World Events. Fired by state/worldEvents.ts's
   * startWorldEvent/runWorldEventsTick/resetWorldEvents whenever a
   * duration-based event (drought/goldRush/cattleDisease/dustStorm) starts or
   * expires - ui/DustStormOverlay.ts is the only listener that cares about a
   * specific type (dustStorm), everything else reacts through gameState's own
   * multiplier getters instead. wanderingSettlers never fires these - it's an
   * instant reward with no lasting state.
   */
  'world-event-started': (payload: { type: DurationWorldEventType; expiresAtElapsedSeconds: number }) => void;
  'world-event-ended': (payload: { type: WorldEventType }) => void;
}

class GameEventBus extends Phaser.Events.EventEmitter {}

export const gameEvents = new GameEventBus();
