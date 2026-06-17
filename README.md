# Shmups ARG 2

A browser-based, pixel-art shoot-'em-up rendered to a `<canvas>`. Written in
vanilla TypeScript/JavaScript with **no framework** — native ES modules served
and bundled by [Vite](https://vitejs.dev/). The render target is a tiny
160×120 internal resolution scaled up to fill the viewport.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (developed on v24)
- npm

## Getting started

```bash
npm install      # install dev dependencies (vite, typescript)
npm run dev      # start the dev server at http://localhost:5501
```

Open <http://localhost:5501>. The dev server has live reload — save any file in
`js/` and the page refreshes automatically.

## Scripts

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Start the Vite dev server (port 5501) with live reload.             |
| `npm run build`     | Produce a production bundle in `dist/`.                             |
| `npm run preview`   | Serve the built `dist/` output locally.                            |
| `npm run typecheck` | Type-check with `tsc --noEmit` (Vite does not type-check on its own). |

> Vite transpiles TypeScript via esbuild, which **does not** report type errors.
> Run `npm run typecheck` to catch them.

## Controls

### Gameplay
| Input            | Action            |
| ---------------- | ----------------- |
| Arrow keys       | Move              |
| `Z`              | Button A (shoot)  |
| `X`              | Button B          |
| Gamepad / touch  | Also supported    |

### Debug (toggle with `` ` `` backtick)
| Key | Action                          |
| --- | ------------------------------- |
| `` ` `` | Toggle debug mode (hitboxes + trails) |
| `P` | Pause / resume the game loop    |
| `O` | Step one frame while paused     |
| `H` | Toggle hitboxes                 |
| `T` | Toggle movement trails          |
| `R` | Re-run bootstrap (restart)      |

## Project structure

```
index.html              # entry point; loads /js/main.ts as a module
vite.config.js          # dev server config (port 5501)
tsconfig.json           # strict TS, noEmit (Vite owns transpilation)
js/
  main.ts               # bootstrap: load assets, build scenes, start loop
  core/                 # engine: game loop, input, viewport, scene/entity managers,
                        #   asset manager, event bus, debug overlay
  entities/             # player, enemies, bullets, particles, HUD elements
  game/                 # gameplay systems: background, sequencer, movers, state
  render/               # canvas renderer + text drawing
  scenes/               # main-menu and gameplay scenes
assets/
  images/               # sprite sheets + manifest.json
  stage-events/         # per-stage event data + manifest.json
  backgrounds/  tilesets/  pico-8.ttf
event-editor/           # standalone tool for authoring stage events
```

## How it boots

`js/main.ts` wires the engine: it constructs the input manager, viewport,
renderer, game loop, asset manager and scene manager, then `bootstrap()`:

1. Loads image assets from `assets/images/manifest.json`.
2. Loads stage event data from `assets/stage-events/manifest.json`.
3. Builds the scenes (`mainMenu`, `stage1`) and starts the loop at 60 fps.

Assets are fetched at runtime (not statically imported). The dev server serves
them from the project root automatically.

## Notes

- **TypeScript migration is in progress.** `main.ts` and
  `core/input-manager.ts` are converted; the rest of `js/` is still `.js`.
  `tsconfig.json` has `allowJs: true` so mixed JS/TS compiles, and `strict` is on.
- **Production builds**: runtime-fetched assets under `assets/` are not yet wired
  into `vite build` output. To ship a build, move them to a `public/` dir or add
  a copy step. The dev server is unaffected.
- **`event-editor/`** is a separate static page for authoring stage events.
