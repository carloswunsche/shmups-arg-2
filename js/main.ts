import InputManager from "./core/input-manager.js";
import Viewport from "./core/viewport.js";
import GameplayRenderer from "./render/gameplay-renderer.js";
import GameLoop from "./core/game-loop.js";
import AssetManager from "./core/asset-manager.js";
import SceneManager from "./core/scene-manager.js";
import MainMenuScene from "./scenes/main-menu-scene.js";
import GameplayScene from "./scenes/gameplay-scene.js";
import Debug from "./core/debug.js";

const input = new InputManager();
const viewport = new Viewport(160, 120);
const renderer = new GameplayRenderer(viewport);
const engine = new GameLoop(60, 60);
const assets = new AssetManager({ renderLoadedFilesOn: viewport.ctx });
const sceneManager = new SceneManager();

// Debug stuff
function update() {sceneManager.updateCurrent()};
function render() {sceneManager.renderCurrent()};
Debug.init(engine, renderer, { update, render, bootstrap });

input.init();
viewport.init();
bootstrap();

function bootstrap() {
  console.clear(); // Don't remove this line
  engine.pause();

  assets.loadImages('./assets/images/manifest.json')
  .then(() => assets.loadStageManifest('./assets/stage-events/manifest.json'))
  .then(() => {
    setupScenes();
    startGame();
  })
  .catch(err => {});
}

function setupScenes() {
  (sceneManager.scenes as Record<string, unknown>).mainMenu = new MainMenuScene(sceneManager, viewport, input);
  (sceneManager.scenes as Record<string, unknown>).stage1   = new GameplayScene(sceneManager, renderer, input, assets, 'stage1');
}

function startGame() {
  sceneManager.switchTo('mainMenu');
  engine.start(()=>sceneManager.updateCurrent(), ()=>sceneManager.renderCurrent());
}