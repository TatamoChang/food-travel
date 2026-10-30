import { Application } from "pixi.js";
import { Game } from "./core/game";
import { loadState, saveState } from "./core/persistence";
import { GameView } from "./render/GameView";
import { loadIcons } from "./render/icons";

async function boot() {
  const host = document.getElementById("app")!;
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: 0x1f1a17,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  host.appendChild(app.canvas);
  await loadIcons();

  const game = new Game(loadState());
  const save = () => saveState(game.snapshot());
  new GameView(app, game, save);
  window.addEventListener("pagehide", save);
  setInterval(save, 10_000);
}

boot();
