import Phaser from 'phaser';
import type { BuildingType, PlacedBuilding } from '../config/buildingConfig';
import type { Resources } from './gameState';

export interface GameEventMap {
  'select-building': (type: BuildingType) => void;
  'cancel-placement': () => void;
  'money-changed': (money: number) => void;
  'building-placed': (building: PlacedBuilding) => void;
  'resources-changed': (resources: Resources) => void;
  'production-tick': () => void;
  'building-selected': (building: PlacedBuilding | null) => void;
  'connections-updated': () => void;
}

class GameEventBus extends Phaser.Events.EventEmitter {}

export const gameEvents = new GameEventBus();
