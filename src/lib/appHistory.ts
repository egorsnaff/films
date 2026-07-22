import { buildAppUrl } from "./appRoutes";
import type { NavigationSnapshot } from "./navigation";

const HISTORY_STATE_KEY = "films";

export type AppHistoryState = {
  [HISTORY_STATE_KEY]: NavigationSnapshot;
};

export function createHistoryState(snapshot: NavigationSnapshot): AppHistoryState {
  return { [HISTORY_STATE_KEY]: snapshot };
}

export function readHistorySnapshot(state: unknown): NavigationSnapshot | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }

  const snapshot = (state as AppHistoryState)[HISTORY_STATE_KEY];
  return snapshot ?? null;
}

export function pushAppHistory(snapshot: NavigationSnapshot): void {
  window.history.pushState(createHistoryState(snapshot), "", buildAppUrl(snapshot));
}

export function replaceAppHistory(snapshot: NavigationSnapshot): void {
  window.history.replaceState(createHistoryState(snapshot), "", buildAppUrl(snapshot));
}
