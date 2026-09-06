import {
  BUILDING_DEFINITIONS,
  BuildingCategory,
  BuildingDefinition,
  BuildingType,
  describeBuilding,
} from '../config/buildingConfig';
import { GAME_SPEEDS } from '../config/constants';
import { gameEvents } from '../state/gameEvents';
import { canAfford, getMoney } from '../state/gameState';
import { getAudioVolume, isAudioMuted, setAudioMuted, setAudioVolume } from '../audio/sound';
import { getBuildingIcon, onBuildingIconsReady } from './buildingIcons';

/**
 * Phase 33: the bar used to be a single wrapping row of 20+ text buttons -
 * unscannable, and getting worse with every building added. It is now
 * categorized into tabs (one per BuildingCategory, driven off the definition
 * so a new building type can't be forgotten here) with icon buttons showing
 * the same pixel art used on the map, plus the pause/speed control and the
 * bulldozer toggle.
 *
 * Buttons for buildings the player can't currently afford are dimmed rather
 * than hidden or disabled: it must stay obvious what exists and what it
 * costs, and clicking one still selects it so the placement preview can
 * explain the problem in context (Phase 33 rejection reasons).
 */
export class BuildingBar {
  private moneyLabel: HTMLSpanElement;
  private buttons = new Map<BuildingType, HTMLButtonElement>();
  private tabs = new Map<BuildingCategory, HTMLButtonElement>();
  private panels = new Map<BuildingCategory, HTMLDivElement>();
  private speedButtons: HTMLButtonElement[] = [];
  private demolishButton: HTMLButtonElement;
  private muteButton!: HTMLButtonElement;
  private volumeSlider!: HTMLInputElement;
  private activeCategory: BuildingCategory = BuildingCategory.Infrastructure;
  private demolishMode = false;

  constructor(container: HTMLElement) {
    const bar = document.createElement('div');
    bar.id = 'building-bar';

    const topRow = document.createElement('div');
    topRow.className = 'bar-row';

    this.moneyLabel = document.createElement('span');
    this.moneyLabel.className = 'money';
    topRow.appendChild(this.moneyLabel);

    for (const category of Object.values(BuildingCategory)) {
      const tab = document.createElement('button');
      tab.className = 'tab';
      tab.textContent = category;
      tab.addEventListener('click', () => this.setCategory(category));
      topRow.appendChild(tab);
      this.tabs.set(category, tab);
    }

    this.demolishButton = document.createElement('button');
    this.demolishButton.className = 'danger';
    this.demolishButton.textContent = 'Bulldoze';
    this.demolishButton.title = 'Demolish mode: click a building to tear it down for a partial refund';
    this.demolishButton.addEventListener('click', () => this.toggleDemolish());
    topRow.appendChild(this.demolishButton);

    topRow.appendChild(this.createSpeedControls());
    topRow.appendChild(this.createAudioControls());
    bar.appendChild(topRow);

    for (const category of Object.values(BuildingCategory)) {
      const panel = document.createElement('div');
      panel.className = 'bar-row building-panel';

      const definitions = Object.values(BUILDING_DEFINITIONS).filter(
        (definition) => definition.category === category,
      );
      for (const definition of definitions) {
        panel.appendChild(this.createBuildingButton(definition));
      }

      bar.appendChild(panel);
      this.panels.set(category, panel);
    }

    container.appendChild(bar);

    this.setCategory(this.activeCategory);
    this.updateMoney(getMoney());

    gameEvents.on('money-changed', (money: number) => this.updateMoney(money));
    gameEvents.on('select-building', (type: BuildingType) => this.setActive(type));
    gameEvents.on('cancel-placement', () => this.setActive(null));
    gameEvents.on('demolish-mode-changed', (active: boolean) => {
      this.demolishMode = active;
      this.demolishButton.classList.toggle('active', active);
    });

    // Icons are rasterised out of the Phaser atlas once BootScene has run,
    // which may be before or after this bar is constructed.
    onBuildingIconsReady(() => this.applyIcons());
  }

  private createBuildingButton(definition: BuildingDefinition): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'building-button';
    button.title = `${definition.label} — ${describeBuilding(definition)}`;

    const icon = document.createElement('span');
    icon.className = 'icon';
    button.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = definition.label;
    button.appendChild(label);

    const cost = document.createElement('span');
    cost.className = 'cost';
    cost.textContent = `$${definition.cost}`;
    button.appendChild(cost);

    button.addEventListener('click', () => this.onButtonClick(definition.type));
    this.buttons.set(definition.type, button);
    return button;
  }

  private createSpeedControls(): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'speed-group';

    const pause = document.createElement('button');
    pause.className = 'speed';
    pause.textContent = 'II';
    pause.title = 'Pause';
    pause.addEventListener('click', () => this.setSpeed(0, pause));
    group.appendChild(pause);
    this.speedButtons.push(pause);

    for (const speed of GAME_SPEEDS) {
      const button = document.createElement('button');
      button.className = 'speed';
      button.textContent = `${speed}x`;
      button.title = `${speed}x speed`;
      button.addEventListener('click', () => this.setSpeed(speed, button));
      group.appendChild(button);
      this.speedButtons.push(button);
      if (speed === 1) {
        button.classList.add('active');
      }
    }

    return group;
  }

  /**
   * Phase 34: mute toggle + volume slider, sitting next to the speed control
   * because they answer the same kind of question ("how is the game running
   * right now") and share the top row's chrome. The audio engine owns the
   * actual state; this is a view over it, which is why the initial values are
   * read back from the engine rather than duplicated here.
   */
  private createAudioControls(): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'speed-group audio-group';

    this.muteButton = document.createElement('button');
    this.muteButton.className = 'speed';
    this.muteButton.title = 'Mute / unmute all sound';
    this.muteButton.addEventListener('click', () => {
      setAudioMuted(!isAudioMuted());
      this.refreshAudioControls();
    });
    group.appendChild(this.muteButton);

    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '100';
    this.volumeSlider.value = `${Math.round(getAudioVolume() * 100)}`;
    this.volumeSlider.className = 'volume';
    this.volumeSlider.title = 'Volume';
    this.volumeSlider.addEventListener('input', () => {
      setAudioVolume(Number(this.volumeSlider.value) / 100);
      // Dragging the slider off 0 is an unambiguous "I want sound".
      if (isAudioMuted() && Number(this.volumeSlider.value) > 0) {
        setAudioMuted(false);
      }
      this.refreshAudioControls();
    });
    group.appendChild(this.volumeSlider);

    this.refreshAudioControls();
    return group;
  }

  private refreshAudioControls(): void {
    const muted = isAudioMuted();
    this.muteButton.textContent = muted ? 'Muted' : 'Sound';
    this.muteButton.classList.toggle('active', !muted);
  }

  private setSpeed(speed: number, button: HTMLButtonElement): void {
    for (const candidate of this.speedButtons) {
      candidate.classList.toggle('active', candidate === button);
    }
    gameEvents.emit('speed-changed', speed);
  }

  private toggleDemolish(): void {
    this.demolishMode = !this.demolishMode;
    this.demolishButton.classList.toggle('active', this.demolishMode);
    if (this.demolishMode) {
      gameEvents.emit('cancel-placement');
    }
    gameEvents.emit('demolish-mode-changed', this.demolishMode);
  }

  private setCategory(category: BuildingCategory): void {
    this.activeCategory = category;
    for (const [candidate, tab] of this.tabs) {
      tab.classList.toggle('active', candidate === category);
    }
    for (const [candidate, panel] of this.panels) {
      panel.style.display = candidate === category ? 'flex' : 'none';
    }
  }

  private applyIcons(): void {
    for (const [type, button] of this.buttons) {
      const dataUrl = getBuildingIcon(type);
      const icon = button.querySelector('.icon');
      if (!dataUrl || !(icon instanceof HTMLElement)) {
        continue;
      }
      icon.style.backgroundImage = `url(${dataUrl})`;
      icon.classList.add('has-image');
    }
  }

  private onButtonClick(type: BuildingType): void {
    if (this.buttons.get(type)?.classList.contains('active')) {
      gameEvents.emit('cancel-placement');
      return;
    }
    gameEvents.emit('select-building', type);
  }

  private setActive(type: BuildingType | null): void {
    for (const [buttonType, button] of this.buttons) {
      button.classList.toggle('active', buttonType === type);
    }
  }

  private updateMoney(money: number): void {
    this.moneyLabel.textContent = `$${Math.round(money * 10) / 10}`;
    for (const [type, button] of this.buttons) {
      button.classList.toggle('unaffordable', !canAfford(type));
    }
  }
}
