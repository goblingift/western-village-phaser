import { BuildingType } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';

/**
 * Phase 33: bridges the Phaser-generated building atlas into the DOM building
 * bar, so its icon buttons show the same pixel art the map does instead of a
 * second, hand-maintained set of icons.
 *
 * BootScene rasterises each building frame into a data URL once (all sprites
 * are procedurally generated into a canvas texture, so this is a cheap
 * one-time canvas read, not an asset load) and publishes it here. The bar may
 * be constructed before or after that happens, hence the small
 * publish/subscribe shape: late subscribers get the icons immediately, early
 * ones get them on 'building-icons-ready'.
 */
type BuildingIconMap = Partial<Record<BuildingType, string>>;

let icons: BuildingIconMap = {};
let ready = false;

export function setBuildingIcons(next: BuildingIconMap): void {
  icons = next;
  ready = true;
  gameEvents.emit('building-icons-ready');
}

export function getBuildingIcon(type: BuildingType): string | null {
  return icons[type] ?? null;
}

export function onBuildingIconsReady(callback: () => void): void {
  if (ready) {
    callback();
    return;
  }
  gameEvents.once('building-icons-ready', callback);
}
