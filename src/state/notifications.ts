import { MAX_NOTIFICATION_LOG_ENTRIES } from '../config/constants';
import { gameEvents } from './gameEvents';

/**
 * Phase 44: Notification Log & Alert System. A small, self-contained module
 * (rather than folding this into gameState.ts directly) for the same reason
 * vegetation.ts stands alone - it's a distinct concern with its own storage
 * and its own cap, and every caller (gameState.ts's production tick/upkeep/
 * destruction paths, MainScene's raid notice) can reach it without gameState
 * having to own yet another unrelated subsystem. It deliberately does NOT
 * import gameState (no cycle risk, matching vegetation.ts's own rule): a
 * caller passes `tickElapsedSeconds` explicitly (gameState already has
 * `elapsedSeconds` in scope everywhere it would emit one; MainScene already
 * imports getElapsedSeconds for its own raid-timing logic).
 */
export type NotificationKind = 'info' | 'warning' | 'danger';

export interface NotificationEntry {
  id: number;
  message: string;
  tickElapsedSeconds: number;
  kind: NotificationKind;
  buildingId?: string;
}

const entries: NotificationEntry[] = [];
let nextId = 1;

export function addNotification(
  message: string,
  kind: NotificationKind,
  tickElapsedSeconds: number,
  buildingId?: string,
): NotificationEntry {
  const entry: NotificationEntry = { id: nextId++, message, tickElapsedSeconds, kind, buildingId };
  entries.push(entry);
  if (entries.length > MAX_NOTIFICATION_LOG_ENTRIES) {
    entries.shift();
  }
  gameEvents.emit('notification-added', entry);
  return entry;
}

/** Oldest-first, capped at MAX_NOTIFICATION_LOG_ENTRIES; the UI reverses this for a newest-first feed. */
export function getNotifications(): readonly NotificationEntry[] {
  return entries;
}

/** Called from gameState's resetGame so a new run starts with an empty log. */
export function clearNotifications(): void {
  entries.length = 0;
}
