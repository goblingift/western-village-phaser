import { gameEvents } from '../state/gameEvents';
import { Blueprint, deleteBlueprint, listBlueprints, renameBlueprint } from '../state/blueprints';

/**
 * Phase 88: Blueprint Copy-Paste. One modal doubles as both the "pick a
 * blueprint to paste" picker and the rename/delete management UI - the phase
 * brief explicitly allows this ("a full new overlay is not required if a
 * simpler in-bar picker works... use your judgment"), and a single list with
 * a Paste/Rename/Delete action row per entry is less UI surface than a
 * separate dropdown-in-the-bar plus a second modal, while still following
 * SaveLoadOverlay's exact fixed-backdrop-modal-with-a-table construction
 * pattern (this codebase's established shape for "a named-slot list with
 * per-row actions").
 *
 * Choosing Paste emits 'blueprint-paste-selected' with the blueprint's id and
 * closes the modal so the player can immediately see the ghost preview
 * follow their cursor; InputSystem is the sole listener and arms Paste mode
 * from it.
 */
export class BlueprintManageOverlay {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private visible = false;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'blueprint-overlay';
    this.overlay.hidden = true;

    this.content = document.createElement('div');
    this.content.id = 'blueprint-panel';
    this.overlay.appendChild(this.content);
    container.appendChild(this.overlay);

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.hide();
      }
    });

    gameEvents.on('toggle-blueprint-overlay', () => this.toggle());
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
    const blueprints = listBlueprints();
    const rows =
      blueprints.length > 0
        ? blueprints.map((blueprint) => this.renderRow(blueprint)).join('')
        : '<tr><td class="save-load-empty">No blueprints saved yet. Use Copy mode (B) to capture one.</td></tr>';

    this.content.innerHTML = `
      <h2>Blueprints</h2>
      <table class="save-load-table">
        ${rows}
      </table>
      <div class="save-load-actions">
        <button type="button" id="blueprint-close">Close</button>
      </div>
    `;

    this.attachHandlers();
  }

  private renderRow(blueprint: Blueprint): string {
    return `
      <tr class="save-load-row">
        <td><b>${this.escapeHtml(blueprint.name)}</b><br><span class="save-load-empty">${blueprint.tiles.length} building${blueprint.tiles.length === 1 ? '' : 's'}</span></td>
        <td class="save-load-actions-cell">
          <button type="button" class="blueprint-paste" data-id="${blueprint.id}">Paste</button>
          <button type="button" class="blueprint-rename" data-id="${blueprint.id}">Rename</button>
          <button type="button" class="blueprint-delete" data-id="${blueprint.id}">Delete</button>
        </td>
      </tr>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private attachHandlers(): void {
    this.content.querySelectorAll<HTMLButtonElement>('.blueprint-paste').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id) {
          return;
        }
        gameEvents.emit('blueprint-paste-selected', id);
        this.hide();
      });
    });
    this.content.querySelectorAll<HTMLButtonElement>('.blueprint-rename').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id) {
          return;
        }
        const existing = listBlueprints().find((blueprint) => blueprint.id === id);
        const newName = window.prompt('Blueprint name:', existing?.name ?? '');
        if (newName === null) {
          return;
        }
        renameBlueprint(id, newName);
        this.render();
      });
    });
    this.content.querySelectorAll<HTMLButtonElement>('.blueprint-delete').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id) {
          return;
        }
        deleteBlueprint(id);
        this.render();
      });
    });
    this.content.querySelector('#blueprint-close')?.addEventListener('click', () => this.hide());
  }
}
