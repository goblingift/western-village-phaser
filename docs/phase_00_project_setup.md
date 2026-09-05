# Phase 0 – Project Setup

## Goal

Create a working Phaser 4 template with TypeScript + Vite.

## Prompt for Claude Code

```text
Project: Western Village (Phaser 4, TypeScript, Vite).

Task:
1. Create a new Phaser 4 + TypeScript + Vite project.
2. Structure:
   - src/main.ts (Bootstrap)
   - src/scenes/BootScene.ts
   - src/scenes/MainScene.ts
   - src/config/gameConfig.ts
3. BootScene loads placeholder assets (simple colored rectangles).
4. MainScene shows an empty scene with camera and mouse input (log to console).
5. Add package.json with scripts: dev, build, lint.
6. Create CLAUDE.md with project goal and tech stack.

Requirements:
- TypeScript strict.
- No external assets except placeholders.
- After each step: run npm install and npm run dev (describe what I need to do manually).

Process:
1. Show me the plan first (which files, what changes).
2. After my approval: implement the changes.
3. At the end: short instructions on how to start the project locally (npm run dev).
```

## Acceptance Criteria

- [ ] `npm run dev` starts the project without errors
- [ ] Browser shows an empty Phaser scene
- [ ] Console logs mouse position on click
- [ ] TypeScript strict mode is active
- [ ] CLAUDE.md exists in root directory

## Next Phase

See `phase_01_tilemap_camera.md`