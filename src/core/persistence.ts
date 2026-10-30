import type { GameState, SavedState } from "./game";

const KEY = "food_travel_save_v2";

export function loadState(): SavedState | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedState) : undefined;
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
