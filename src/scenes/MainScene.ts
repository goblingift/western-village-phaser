import Phaser from 'phaser';

export class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2d2d2d');

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      console.log(`pointerdown at world (${pointer.worldX}, ${pointer.worldY})`);
    });
  }
}
