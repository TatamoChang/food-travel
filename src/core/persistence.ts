import type { GameState } from "./game";

const KEY = "food_travel_save_v2";

export function loadState(): GameState | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GameState) : undefined;
  } catch {
    return undefined;
  }
}

export function saveState(state: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode / quota); play on without saving.
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
