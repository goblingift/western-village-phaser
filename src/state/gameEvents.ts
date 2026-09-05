import Phaser from 'phaser';
import type { BuildingType, PlacedBuilding } from '../config/buildingConfig';

export interface GameEventMap {
  'select-building': (type: BuildingType) => void;
  'cancel-placement': () => void;
  'money-changed': (money: number) => void;
  'building-placed': (building: PlacedBuilding) => void;
}

class GameEventBus extends Phaser.Events.EventEmitter {}

export const gameEvents = new GameEventBus();
