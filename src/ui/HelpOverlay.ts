import { RESOURCE_LABELS, ResourceKey } from '../config/buildingConfig';
import { getResourceConsumerLabels, getResourceProducerLabels } from '../config/resourceGraph';
import { gameEvents } from '../state/gameEvents';

/**
 * Phase 64: static hotkey + resource-chain reference, opened with H (or ?).
 *
 * The chain half is DERIVED from resourceGraph.ts rather than written out by
 * hand: that module already scans BUILDING_DEFINITIONS (plus the animal,
 * harvest, house-need and sell tables) for producers/consumers, so this panel
 * can never fall out of sync with the real economy the way a hardcoded list
 * would the next time a building or chain is added.
 *
 * Unlike the tutorial's docked card this IS a centered modal - it's a
 * read-it-then-close reference, not something you act on while it's open, and
 * a modal is the only way to fit 15 hotkeys plus 14 resource rows without
 * colliding with the eight panels already occupying every screen corner.
 */

interface HotkeyEntry {
  keys: string;
  description: string;
}

/** Mirrors MainScene.setupHotkeys/setupKeyboardCamera and the pointer handlers - the authoritative list for a player. */
const HOTKEYS: HotkeyEntry[] = [
  { keys: 'W A S D / Arrows', description: 'Pan the camera' },
  { keys: 'Right-drag', description: 'Pan the camera by dragging' },
  { keys: 'Mouse wheel', description: 'Zoom to cursor' },
  { keys: 'Left-drag', description: 'Box-select your units (or drag a Road/Fence line while one is selected)' },
  { keys: 'Right-click', description: 'Move order; on a raider or camp, attack order' },
  { keys: 'Shift + place', description: 'Keep the building tool selected to place another' },
  { keys: 'Esc', description: 'Cancel placement / clear resource selection' },
  { keys: '1 - 9', description: 'Recall control group, or switch building category' },
  { keys: 'Ctrl + 1 - 9', description: 'Assign selected units to a control group' },
  { keys: 'Double-tap group', description: 'Recall the group and center the camera on it' },
  { keys: 'Double-click unit', description: 'Select every unit of that kind' },
  { keys: 'Space', description: 'Cycle through idle units' },
  { keys: 'Delete / Backspace', description: 'Demolish the selected building' },
  { keys: 'C', description: 'Toggle the resource chain highlight overlay' },
  { keys: 'V', description: 'Toggle the statistics & efficiency panel' },
  { keys: 'E', description: 'Toggle the fence-enclosure debug overlay' },
  { keys: 'H / ?', description: 'Open this help panel' },
];

export class HelpOverlay {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private visible = false;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'help-overlay';
    this.overlay.hidden = true;

    this.content = document.createElement('div');
    this.content.id = 'help-panel';
    this.overlay.appendChild(this.content);
    container.appendChild(this.overlay);

    // Clicking the dimmed backdrop (but not the panel itself) closes it.
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.hide();
      }
    });

    gameEvents.on('toggle-help-overlay', () => this.toggle());
  }

  private toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private hide(): void {
    this.visible = false;
    this.overlay.hidden = true;
  }

  private show(): void {
    // Rendered on open rather than in the constructor so the chain table
    // reflects the live config (and so a never-opened panel costs nothing).
    this.content.innerHTML = `
      <h2>Help &amp; Reference</h2>
      <h3>Controls</h3>
      <table class="help-table">${this.renderHotkeyRows()}</table>
      <h3>Resource Chains</h3>
      <div class="help-note">Who makes what, and who wants it. Click a resource in the top-left HUD to highlight its buildings on the map.</div>
      <table class="help-table">${this.renderChainRows()}</table>
      <div class="help-actions">
        <button type="button" id="help-replay-tutorial">Replay tutorial</button>
        <button type="button" id="help-close">Close</button>
      </div>
    `;

    this.content.querySelector('#help-close')?.addEventListener('click', () => this.hide());
    this.content.querySelector('#help-replay-tutorial')?.addEventListener('click', () => {
      this.hide();
      gameEvents.emit('start-tutorial');
    });

    this.visible = true;
    this.overlay.hidden = false;
  }

  private renderHotkeyRows(): string {
    return HOTKEYS.map(
      (entry) => `<tr><td class="help-key">${entry.keys}</td><td>${entry.description}</td></tr>`,
    ).join('');
  }

  private renderChainRows(): string {
    return (Object.keys(RESOURCE_LABELS) as ResourceKey[])
      .map((key) => {
        const producers = getResourceProducerLabels(key);
        const consumers = getResourceConsumerLabels(key);
        // A resource with no producer/consumer would render a bare arrow, so
        // both sides fall back to an explicit dash.
        const from = producers.length > 0 ? producers.join(', ') : '-';
        const to = consumers.length > 0 ? consumers.join(', ') : '-';
        return `<tr><td class="help-key">${RESOURCE_LABELS[key]}</td><td><b>From:</b> ${from}<br><b>Used by:</b> ${to}</td></tr>`;
      })
      .join('');
  }
}
