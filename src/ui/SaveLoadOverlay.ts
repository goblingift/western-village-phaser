import { Difficulty, RunMode } from '../config/constants';
import { gameEvents } from '../state/gameEvents';
import {
  AUTOSAVE_SLOT,
  ManualSaveSlotName,
  MANUAL_SAVE_SLOTS,
  SaveSlotInfo,
  deleteSlot,
  getManualSaveSlots,
  hasSaveSlot,
  listSaveSlots,
  loadFromSlot,
  saveToSlot,
} from '../state/persistence';
import { formatDuration } from '../state/records';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

const MODE_LABELS: Record<RunMode, string> = {
  endless: 'Endless',
  fixed: '3 Days',
};

/**
 * Phase 65: replaces BuildingBar's old inline Save/Load button pair with a
 * dedicated modal listing all four save slots (three named manual slots plus
 * the one rotating autosave), following HelpOverlay's exact construction/
 * show-hide pattern - a centered modal is appropriate here too, since saving
 * or loading is a deliberate pause-and-choose action, not something done
 * while the modal stays open.
 */
export class SaveLoadOverlay {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private visible = false;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'save-load-overlay';
    this.overlay.hidden = true;

    this.content = document.createElement('div');
    this.content.id = 'save-load-panel';
    this.overlay.appendChild(this.content);
    container.appendChild(this.overlay);

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.hide();
      }
    });

    gameEvents.on('toggle-save-load-overlay', () => this.toggle());
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
    this.render();
    this.visible = true;
    this.overlay.hidden = false;
  }

  private render(): void {
    const manualSlots = getManualSaveSlots();
    const autosaveInfo = listSaveSlots().find((slot) => slot.name === AUTOSAVE_SLOT) ?? null;

    const manualRows = MANUAL_SAVE_SLOTS.map((name, index) =>
      this.renderManualRow(name, index + 1, manualSlots[index]),
    ).join('');

    this.content.innerHTML = `
      <h2>Save / Load</h2>
      <table class="save-load-table">
        ${manualRows}
        ${this.renderAutosaveRow(autosaveInfo)}
      </table>
      <div class="save-load-actions">
        <button type="button" id="save-load-close">Close</button>
      </div>
    `;

    this.attachHandlers();
  }

  private renderManualRow(name: ManualSaveSlotName, slotNumber: number, info: SaveSlotInfo | null): string {
    const title = info ? this.describeSlot(info, `Slot ${slotNumber}`) : `<b>Empty Slot ${slotNumber}</b>`;
    const detail = info ? this.describeSlotDetail(info) : '<span class="save-load-empty">No save yet.</span>';

    const actions = info
      ? `<button type="button" class="save-load-save" data-slot="${name}">Save Over</button>
         <button type="button" class="save-load-load" data-slot="${name}">Load</button>
         <button type="button" class="save-load-delete" data-slot="${name}">Delete</button>`
      : `<button type="button" class="save-load-save" data-slot="${name}">Save</button>`;

    return `
      <tr class="save-load-row">
        <td>${title}<br>${detail}</td>
        <td class="save-load-actions-cell">${actions}</td>
      </tr>
    `;
  }

  private renderAutosaveRow(info: SaveSlotInfo | null): string {
    const title = info ? this.describeSlot(info, 'Autosave') : '<b>Autosave</b>';
    const detail = info ? this.describeSlotDetail(info) : '<span class="save-load-empty">No autosave yet.</span>';
    const actions = info
      ? `<button type="button" class="save-load-load" data-slot="${AUTOSAVE_SLOT}">Load</button>`
      : '';

    return `
      <tr class="save-load-row">
        <td>${title}<br>${detail}</td>
        <td class="save-load-actions-cell">${actions}</td>
      </tr>
    `;
  }

  private describeSlot(info: SaveSlotInfo, fallbackName: string): string {
    return `<b>${info.label || fallbackName}</b>`;
  }

  private describeSlotDetail(info: SaveSlotInfo): string {
    const difficulty = DIFFICULTY_LABELS[info.difficulty] ?? info.difficulty;
    const mode = MODE_LABELS[info.runMode] ?? info.runMode;
    return `Day ${info.dayNumber} &middot; ${formatDuration(info.elapsedSeconds)} &middot; $${info.netWorth} net worth &middot; ${difficulty} / ${mode} &middot; ${info.buildingCount} buildings`;
  }

  private attachHandlers(): void {
    this.content.querySelectorAll<HTMLButtonElement>('.save-load-save').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.slot as string;
        const existingLabel = getManualSaveSlots().find((info) => info?.name === slot)?.label ?? '';
        const label = window.prompt('Save name (optional):', existingLabel) ?? undefined;
        saveToSlot(slot, label || undefined);
        this.render();
      });
    });
    this.content.querySelectorAll<HTMLButtonElement>('.save-load-load').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.slot as string;
        if (!hasSaveSlot(slot)) {
          return;
        }
        loadFromSlot(slot);
        this.hide();
      });
    });
    this.content.querySelectorAll<HTMLButtonElement>('.save-load-delete').forEach((button) => {
      button.addEventListener('click', () => {
        const slot = button.dataset.slot as string;
        deleteSlot(slot);
        this.render();
      });
    });
    this.content.querySelector('#save-load-close')?.addEventListener('click', () => this.hide());
  }
}
