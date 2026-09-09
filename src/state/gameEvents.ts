import Phaser from 'phaser';
import type { BuildingCategory, BuildingType, PlacedBuilding, ResourceKey } from '../config/buildingConfig';
import type { TownRank } from '../config/townRank';
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
   * Phase 64: opens/closes the static hotkey + resource-chain reference.
   * Emitted by MainScene's 'H'/'?' hotkey and BuildingBar's Help button;
   * HelpOverlay owns its own shown/hidden state and is the only listener,
   * exactly like 'toggle-statistics-panel' above.
   */
  'toggle-help-overlay': () => void;
  /**
   * Phase 93: opens/closes the Economy panel ("what sells where"). Emitted by
   * the 'M' hotkey and BuildingBar's Economy button; EconomyPanel owns its own
   * shown/hidden state and is the only listener, exactly like
   * 'toggle-help-overlay'/'toggle-statistics-panel' above.
   */
  'toggle-economy-panel': () => void;
  /**
   * Phase 96: fired by gameState.checkBuildingUnlocks the first time a
   * building's unlock requirement is met, alongside the existing notification.
   * Exists so a listener can react to an unlock structurally rather than by
   * string-matching notification text.
   */
  'building-unlocked': (type: BuildingType) => void;
  /**
   * Phase 64: (re)starts the first-run tutorial from step 1, regardless of
   * the "tutorial seen" flag. Emitted by the Help panel's Replay button, so a
   * player who skipped it can always get it back.
   */
  'start-tutorial': () => void;
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
  /**
   * Phase 65: opens/closes the Save/Load overlay (three manual slots + the
   * read-only autosave slot). Emitted by BuildingBar's "Saves" button;
   * SaveLoadOverlay owns its own shown/hidden state and is the only listener,
   * exactly like 'toggle-statistics-panel'/'toggle-help-overlay'.
   */
  'toggle-save-load-overlay': () => void;
  /**
   * Phase 84: opens/closes the Prestige ("Establish a New Town") overlay.
   * Emitted by BuildingBar's "Legacy" button and DifficultySelectOverlay's
   * pre-run shop link; PrestigeOverlay owns its own shown/hidden state and is
   * the only listener, exactly like 'toggle-help-overlay'/
   * 'toggle-save-load-overlay'.
   */
  'toggle-prestige-overlay': () => void;
  /**
   * Phase 69: fired by gameState's setGateOpen/setAllGates AFTER the affected
   * WoodenGate's nearby enclosures have already been recomputed (see those
   * functions' own doc comment - this ordering is the mandatory fix for the
   * exact cache-invalidation bug class the 2026-09-07 "Enclosure Cache
   * Invalidation Fix" entry describes). MainScene swaps the gate's sprite
   * frame (open/closed) and redraws the enclosure-exit-hint; BuildingInfoPanel
   * re-renders if that gate is currently selected.
   */
  'gate-state-changed': (building: PlacedBuilding) => void;
  /**
   * Phase 83: fired by gameState's runTownRankCheck whenever the town's
   * derived rank (see config/townRank.ts) actually climbs a tier - mirrors
   * 'house-tier-changed's exact shape (a before/after comparison, no separate
   * debounce Set needed since the comparison itself only ever fires once per
   * crossing). ObjectivesPanel already re-renders every production-tick and
   * would pick up the new rank on its own, but this event is what
   * notifications.ts's promotion notice and any future UI cue key off.
   */
  'town-rank-changed': (payload: { rank: TownRank; previousRank: TownRank }) => void;
  /**
   * Phase 84: fired by gameState's establishNewTown() right after the full
   * resetGame() reseed it performs - PrestigeOverlay listens to show a
   * confirmation ("New town founded! +N legacy") and re-render its own
   * balance/shop state, since a bare 'game-reset' carries no legacy-earned
   * figure of its own.
   */
  'town-established': (payload: { legacyEarned: number }) => void;
  /**
   * Phase 88: opens/closes the Blueprint picker/manage modal (paste-selection
   * + rename/delete). Emitted by BuildingBar's "Blueprints" button;
   * BlueprintManageOverlay owns its own shown/hidden state and is the only
   * listener, exactly like 'toggle-help-overlay'/'toggle-save-load-overlay'.
   */
  'toggle-blueprint-overlay': () => void;
  /**
   * Phase 88: toggles Blueprint Copy mode. Emitted by BuildingBar's "Copy"
   * button; InputSystem is the sole listener (its own toggleBlueprintCopyMode,
   * also bound to the 'B' hotkey) and re-emits 'blueprint-copy-mode-changed'
   * once the mode actually flips, which is what drives the button's active
   * state - the same "UI emits a bare toggle, the owning system is the single
   * source of truth for the resulting state" shape 'demolish-mode-changed'
   * already uses between BuildingBar and InputSystem's demolish mode.
   */
  'toggle-blueprint-copy-mode': () => void;
  /**
   * Phase 88: fired by InputSystem whenever Copy mode is entered/exited (the
   * 'B' hotkey or BuildingBar's Copy button), so BuildingBar can toggle the
   * button's active state the same way 'demolish-mode-changed' drives the
   * Bulldoze button.
   */
  'blueprint-copy-mode-changed': (active: boolean) => void;
  /**
   * Phase 88: fired by BuildingManageOverlay's picker when a saved blueprint
   * is chosen for pasting (or `null` to cancel an in-progress paste);
   * InputSystem is the sole listener and enters/exits Paste mode accordingly.
   */
  'blueprint-paste-selected': (blueprintId: string | null) => void;
}

class GameEventBus extends Phaser.Events.EventEmitter {}

export const gameEvents = new GameEventBus();
