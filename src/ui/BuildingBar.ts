import {
  BUILDING_DEFINITIONS,
  BuildingCategory,
  BuildingDefinition,
  BuildingType,
  describeBuilding,
  formatBuildingCost,
} from '../config/buildingConfig';
import { GAME_SPEEDS } from '../config/constants';
import { gameEvents } from '../state/gameEvents';
import { canAfford, describeUnlockRequirement, getMoney, isBuildingUnlocked, setAllGates } from '../state/gameState';
import {
  getAudioVolume,
  getMusicVolume,
  isAudioMuted,
  setAudioMuted,
  setAudioVolume,
  setMusicVolume,
} from '../audio/sound';
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
  /** Phase 47: the normal "Label — cost/production summary" tooltip, restored once a locked button unlocks. */
  private baseTitles = new Map<BuildingType, string>();
  private tabs = new Map<BuildingCategory, HTMLButtonElement>();
  private panels = new Map<BuildingCategory, HTMLDivElement>();
  private speedButtons: HTMLButtonElement[] = [];
  private demolishButton: HTMLButtonElement;
  /** Phase 88: mirrors demolishButton's own active-state toggle, just driven by 'blueprint-copy-mode-changed' instead of 'demolish-mode-changed'. */
  private blueprintCopyButton!: HTMLButtonElement;
  private muteButton!: HTMLButtonElement;
  private volumeSlider!: HTMLInputElement;
  private musicVolumeSlider!: HTMLInputElement;
  private activeCategory: BuildingCategory = BuildingCategory.Housing;
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
    topRow.appendChild(this.createGateControls());
    topRow.appendChild(this.createBlueprintControls());
    topRow.appendChild(this.createStatsButton());
    topRow.appendChild(this.createEconomyButton());
    topRow.appendChild(this.createHelpButton());
    topRow.appendChild(this.createSaveLoadButton());
    topRow.appendChild(this.createPrestigeButton());
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
    // Phase 37: a building can also be unaffordable purely on materials, so
    // the dim state must refresh on the resource pool too, not just money.
    // Phase 47: unlock state (population/net worth/day) changes on the same
    // cadence, so the lock/unlock check rides these same events rather than
    // its own timer - 'production-tick' and 'house-tier-changed' cover
    // population/net-worth drift between resource-pool changes, and
    // 'building-placed' covers the instant net-worth jump from a purchase.
    gameEvents.on('resources-changed', () => this.refreshButtonStates());
    gameEvents.on('production-tick', () => this.refreshButtonStates());
    gameEvents.on('house-tier-changed', () => this.refreshButtonStates());
    gameEvents.on('building-placed', () => this.refreshButtonStates());
    gameEvents.on('select-building', (type: BuildingType) => this.setActive(type));
    gameEvents.on('cancel-placement', () => this.setActive(null));
    gameEvents.on('demolish-mode-changed', (active: boolean) => {
      this.demolishMode = active;
      this.demolishButton.classList.toggle('active', active);
    });
    // Phase 41: MainScene's bare-number-key hotkey (only live when no units
    // are selected and neither placement nor demolish mode is active - see
    // MainScene.trySwitchBuildingCategory) switches tabs the same way a tab
    // click does.
    gameEvents.on('select-category', (category: BuildingCategory) => this.setCategory(category));

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
    cost.textContent = formatBuildingCost(definition);
    button.appendChild(cost);

    button.addEventListener('click', () => this.onButtonClick(definition.type));
    this.buttons.set(definition.type, button);
    this.baseTitles.set(definition.type, button.title);
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
   *
   * Phase 59: a second slider drives the independent music-bus volume
   * (ambient loop + wind/cricket soundscape) added in audio/sound.ts. It
   * shares the single mute button/state with SFX rather than getting its own
   * mute - "Mute / unmute all sound" already answers "is anything playing at
   * all", and a second mute toggle for one of two buses would just be a
   * second way to ask the same question.
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
    this.volumeSlider.title = 'Sound effects volume';
    this.volumeSlider.addEventListener('input', () => {
      setAudioVolume(Number(this.volumeSlider.value) / 100);
      // Dragging the slider off 0 is an unambiguous "I want sound".
      if (isAudioMuted() && Number(this.volumeSlider.value) > 0) {
        setAudioMuted(false);
      }
      this.refreshAudioControls();
    });
    group.appendChild(this.volumeSlider);

    this.musicVolumeSlider = document.createElement('input');
    this.musicVolumeSlider.type = 'range';
    this.musicVolumeSlider.min = '0';
    this.musicVolumeSlider.max = '100';
    this.musicVolumeSlider.value = `${Math.round(getMusicVolume() * 100)}`;
    this.musicVolumeSlider.className = 'volume music-volume';
    this.musicVolumeSlider.title = 'Music & ambience volume';
    this.musicVolumeSlider.addEventListener('input', () => {
      setMusicVolume(Number(this.musicVolumeSlider.value) / 100);
      if (isAudioMuted() && Number(this.musicVolumeSlider.value) > 0) {
        setAudioMuted(false);
      }
      this.refreshAudioControls();
    });
    group.appendChild(this.musicVolumeSlider);

    this.refreshAudioControls();
    return group;
  }

  private refreshAudioControls(): void {
    const muted = isAudioMuted();
    this.muteButton.textContent = muted ? 'Muted' : 'Sound';
    this.muteButton.classList.toggle('active', !muted);
  }

  /**
   * Phase 49: opens the opt-in Statistics & Efficiency panel. The button
   * itself holds no shown/hidden state - it just emits the same toggle event
   * the 'V' hotkey does, and StatisticsPanel is the sole listener.
   */
  /** Phase 64: the tutorial is dismissible and only auto-runs once, so the help panel needs a permanently visible entry point for anyone who skipped it or forgot the H key. */
  private createHelpButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'speed';
    button.textContent = 'Help';
    button.title = 'Hotkeys and resource chains (H)';
    button.addEventListener('click', () => gameEvents.emit('toggle-help-overlay'));
    return button;
  }

  /**
   * Phase 69: two small always-shown buttons rather than one label-flipping
   * toggle - a single button would need to track (or query) the town's
   * majority gate state just to pick its own label, which duplicates
   * MainScene.toggleAllGates' own majority-state logic for the 'G' hotkey;
   * two explicit buttons instead let "close everything"/"open everything"
   * stay simple, unconditional calls straight into setAllGates, matching the
   * plain speed/mute button style already used in this row.
   */
  private createGateControls(): HTMLDivElement {
    const wrapper = document.createElement('div');
    // Same flex/gap base as speed-group/audio-group, its own margin override
    // (gate-controls) so it doesn't re-claim speed-group's margin-left:auto.
    wrapper.className = 'speed-group gate-controls';

    const openButton = document.createElement('button');
    openButton.className = 'speed';
    openButton.textContent = 'Open Gates';
    openButton.title = 'Open every placed Wooden Gate (G toggles by majority state)';
    openButton.addEventListener('click', () => setAllGates(true));
    wrapper.appendChild(openButton);

    const closeButton = document.createElement('button');
    closeButton.className = 'speed';
    closeButton.textContent = 'Close Gates';
    closeButton.title = 'Close every placed Wooden Gate (G toggles by majority state)';
    closeButton.addEventListener('click', () => setAllGates(false));
    wrapper.appendChild(closeButton);

    return wrapper;
  }

  /**
   * Phase 88: Blueprint Copy-Paste. "Copy" toggles InputSystem's Copy mode
   * (drag a rectangle over placed buildings to capture them) - mirrors the
   * Bulldoze button's own active-state toggle (`demolish-mode-changed`),
   * just for `blueprint-copy-mode-changed` instead, since the two modes are
   * exclusive but otherwise share nothing button-side. "Blueprints" opens the
   * combined picker/rename/delete modal (BlueprintManageOverlay), which also
   * doubles as the "choose what to paste" UI per the phase's own scoping
   * note that a separate in-bar dropdown isn't required.
   */
  private createBlueprintControls(): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'speed-group blueprint-controls';

    this.blueprintCopyButton = document.createElement('button');
    this.blueprintCopyButton.className = 'speed';
    this.blueprintCopyButton.textContent = 'Copy';
    this.blueprintCopyButton.title = 'Blueprint Copy mode: drag a rectangle over buildings to capture them (B)';
    this.blueprintCopyButton.addEventListener('click', () => this.toggleBlueprintCopyMode());
    group.appendChild(this.blueprintCopyButton);

    const manageButton = document.createElement('button');
    manageButton.className = 'speed';
    manageButton.textContent = 'Blueprints';
    manageButton.title = 'Paste a saved blueprint, or rename/delete one';
    manageButton.addEventListener('click', () => gameEvents.emit('toggle-blueprint-overlay'));
    group.appendChild(manageButton);

    gameEvents.on('blueprint-copy-mode-changed', (active: boolean) => {
      this.blueprintCopyButton.classList.toggle('active', active);
    });

    return group;
  }

  /**
   * Copy mode has no local boolean of its own here - InputSystem is the
   * single source of truth (mirroring how demolishMode's local field only
   * ever mirrors 'demolish-mode-changed', never drives the toggle itself).
   * A bare emit is enough since InputSystem's own toggleBlueprintCopyMode
   * (triggered by the 'B' hotkey too) is what actually flips the mode and
   * re-emits the event this button listens for.
   */
  private toggleBlueprintCopyMode(): void {
    gameEvents.emit('toggle-blueprint-copy-mode');
  }

  /** Phase 93: sibling of the Stats button; opens the "what sells where" reference. */
  private createEconomyButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'speed';
    button.textContent = 'Economy';
    button.title = 'What every good is worth and which building sells it (M)';
    button.addEventListener('click', () => gameEvents.emit('toggle-economy-panel'));
    return button;
  }

  private createStatsButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'speed';
    button.textContent = 'Stats';
    button.title = 'Toggle the Statistics & Efficiency panel (V)';
    button.addEventListener('click', () => gameEvents.emit('toggle-statistics-panel'));
    return button;
  }

  /**
   * Phase 65: replaces the old inline Save/Load button pair (which only ever
   * operated on a single 'manual' slot) with one button opening the new
   * SaveLoadOverlay modal, which itself lists all three named manual slots
   * plus the read-only autosave slot.
   */
  private createSaveLoadButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'speed';
    button.textContent = 'Saves';
    button.title = 'Open the Save/Load menu';
    button.addEventListener('click', () => gameEvents.emit('toggle-save-load-overlay'));
    return button;
  }

  /**
   * Phase 84: opens the Prestige shop / "Establish a New Town" modal. Mid-run
   * entry point - DifficultySelectOverlay carries a second, pre-run one that
   * emits the same event, so legacy can be spent either before or during a
   * run.
   */
  private createPrestigeButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'speed';
    button.textContent = 'Legacy';
    button.title = 'Prestige: spend legacy points, or establish a new town';
    button.addEventListener('click', () => gameEvents.emit('toggle-prestige-overlay'));
    return button;
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
    // Phase 47: a locked building never enters placement mode - unlike an
    // unlocked-but-unaffordable one, which still does so the preview can
    // explain the rejection (Phase 33's existing behavior, unchanged here).
    if (!isBuildingUnlocked(type)) {
      return;
    }
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
    this.refreshButtonStates();
  }

  /**
   * Phase 47: a locked building is a distinct state from an unlocked-but-
   * unaffordable one - it gets the 'locked' class (greyscale + lock badge,
   * see index.html) instead of 'unaffordable', and its tooltip is swapped to
   * the unmet requirement rather than the normal cost/production summary.
   */
  private refreshButtonStates(): void {
    for (const [type, button] of this.buttons) {
      const unlocked = isBuildingUnlocked(type);
      button.classList.toggle('locked', !unlocked);
      if (!unlocked) {
        button.classList.remove('unaffordable');
        const requirement = describeUnlockRequirement(type);
        button.title = requirement ? `${BUILDING_DEFINITIONS[type].label} — ${requirement}` : button.title;
        continue;
      }
      button.classList.toggle('unaffordable', !canAfford(type));
      button.title = this.baseTitles.get(type) ?? button.title;
    }
  }
}
