import Phaser from 'phaser';
import type { BuildingCategory, BuildingType, PlacedBuilding } from '../config/buildingConfig';
import type { DayPhaseChange, GameOverSummary, Resources } from './gameState';
import type { VegetationEntity } from './vegetation';

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
  'building-removed': (payload: BuildingRemovedPayload) => void;
  'building-repaired': (building: PlacedBuilding) => void;
  'vegetation-added': (entity: VegetationEntity) => void;
  'vegetation-removed': (entity: VegetationEntity) => void;
  'demolish-mode-changed': (active: boolean) => void;
  'speed-changed': (speed: number) => void;
  'building-icons-ready': () => void;
  /** Phase 34: fired on every day->night / night->day boundary (and on reset). */
  'day-phase-changed': (change: DayPhaseChange) => void;
  /** Phase 34: audio master mute/volume, owned by the audio engine, driven from the building bar. */
  'audio-settings-changed': (settings: { muted: boolean; volume: number }) => void;
  /**
   * Phase 39: GameOverOverlay's Play Again button no longer calls resetGame()
   * directly with whatever difficulty/mode the last run used - it emits this,
   * and DifficultySelectOverlay is what re-opens itself and eventually calls
   * resetGame with the player's freshly chosen settings.
   */
  'request-run-restart': () => void;
  /** Phase 41: fired by MainScene's bare-number-key building-category hotkey; BuildingBar is the only listener. */
  'select-category': (category: BuildingCategory) => void;
}

class GameEventBus extends Phaser.Events.EventEmitter {}

export const gameEvents = new GameEventBus();
