import { BUILDING_DEFINITIONS, BuildingType, describeBuilding } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';
import { getMoney } from '../state/gameState';

export class BuildingBar {
  private moneyLabel: HTMLSpanElement;
  private buttons = new Map<BuildingType, HTMLButtonElement>();

  constructor(container: HTMLElement) {
    const bar = document.createElement('div');
    bar.id = 'building-bar';

    this.moneyLabel = document.createElement('span');
    this.moneyLabel.className = 'money';
    bar.appendChild(this.moneyLabel);

    for (const definition of Object.values(BUILDING_DEFINITIONS)) {
      const button = document.createElement('button');
      button.textContent = `${definition.label} ($${definition.cost})`;
      button.title = `${definition.label} — ${describeBuilding(definition)}`;
      button.addEventListener('click', () => this.onButtonClick(definition.type));
      bar.appendChild(button);
      this.buttons.set(definition.type, button);
    }

    container.appendChild(bar);

    this.updateMoney(getMoney());
    gameEvents.on('money-changed', (money: number) => this.updateMoney(money));
    gameEvents.on('select-building', (type: BuildingType) => this.setActive(type));
    gameEvents.on('cancel-placement', () => this.setActive(null));
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
    this.moneyLabel.textContent = `Money: $${money}`;
  }
}
