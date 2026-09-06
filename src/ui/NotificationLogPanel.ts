import { BUILDING_DEFINITIONS } from '../config/buildingConfig';
import { TILE_SIZE } from '../config/constants';
import { gameEvents } from '../state/gameEvents';
import { getBuildingById } from '../state/gameState';
import { NotificationEntry, NotificationKind, getNotifications } from '../state/notifications';

/**
 * Phase 44: Notification Log & Alert System's persistent feed. A DOM overlay
 * (matching BuildingInfoPanel's choice, not ResourceHudPanel/minimap's
 * Phaser-canvas one) since it's a scrollable, clickable list of text rows -
 * exactly the shape BuildingInfoPanel already is, and nothing here needs to
 * live inside the camera-scrolled world. Lives in #stage alongside
 * BuildingInfoPanel (it's an in-game overlay, not chrome around the play
 * area), anchored to the opposite corner (bottom-left) so the two never
 * collide.
 *
 * Deliberately does not own any building/camera logic itself: a click on an
 * entry with a buildingId asks MainScene to pan there via the
 * 'camera-focus-requested' event rather than this panel reaching into
 * Phaser's camera directly.
 */
const MAX_VISIBLE_ENTRIES = 20;

const KIND_COLORS: Record<NotificationKind, string> = {
  info: '#8bc34a',
  warning: '#ffca28',
  danger: '#ef5350',
};

export class NotificationLogPanel {
  private panel: HTMLDivElement;
  private header: HTMLDivElement;
  private list: HTMLDivElement;
  private collapsed = false;

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'notification-log-panel';

    this.header = document.createElement('div');
    this.header.className = 'notification-log-header';
    this.header.addEventListener('click', () => this.toggleCollapsed());
    this.panel.appendChild(this.header);

    this.list = document.createElement('div');
    this.list.className = 'notification-log-list';
    this.panel.appendChild(this.list);

    container.appendChild(this.panel);

    gameEvents.on('notification-added', () => this.render());
    // Phase 39's resetGame clears the log (state/notifications.ts's
    // clearNotifications) before this fires, so a plain re-render is enough.
    gameEvents.on('game-reset', () => this.render());

    this.render();
  }

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    this.render();
  }

  private render(): void {
    this.list.hidden = this.collapsed;
    this.header.textContent = `Notifications ${this.collapsed ? '▸' : '▾'}`;

    const entries = getNotifications();
    // getNotifications() is oldest-first (append-only log); the feed reads
    // newest-first, so slice the tail then reverse it.
    const visible = entries.slice(-MAX_VISIBLE_ENTRIES).slice().reverse();

    this.list.innerHTML = '';

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notification-log-empty';
      empty.textContent = 'No events yet.';
      this.list.appendChild(empty);
      return;
    }

    for (const entry of visible) {
      this.list.appendChild(this.renderEntry(entry));
    }
  }

  private renderEntry(entry: NotificationEntry): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'notification-log-entry';
    row.style.color = KIND_COLORS[entry.kind];
    row.textContent = `[${this.formatTime(entry.tickElapsedSeconds)}] ${entry.message}`;

    if (entry.buildingId) {
      row.classList.add('clickable');
      row.addEventListener('click', () => this.focusBuilding(entry.buildingId!));
    }

    return row;
  }

  /** No-ops silently if the building has since been demolished/destroyed - there's nowhere left to pan to. */
  private focusBuilding(buildingId: string): void {
    const building = getBuildingById(buildingId);
    if (!building) {
      return;
    }
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const worldX = building.tileX * TILE_SIZE + (width * TILE_SIZE) / 2;
    const worldY = building.tileY * TILE_SIZE + (height * TILE_SIZE) / 2;
    gameEvents.emit('camera-focus-requested', worldX, worldY);
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
