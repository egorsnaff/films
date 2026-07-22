import { buildAppUrl } from "./appRoutes";
import type { NavigationSnapshot } from "./navigation";

const HISTORY_STATE_KEY = "films";
const HISTORY_SESSION_KEY = "filmsSession";

export type AppHistoryState = {
  [HISTORY_STATE_KEY]: NavigationSnapshot;
  [HISTORY_SESSION_KEY]?: number;
};

export function createHistoryState(
  snapshot: NavigationSnapshot,
  session?: number
): AppHistoryState {
  return {
    [HISTORY_STATE_KEY]: snapshot,
    ...(typeof session === "number" ? { [HISTORY_SESSION_KEY]: session } : {})
  };
}

export function readHistorySnapshot(state: unknown): NavigationSnapshot | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }

  const snapshot = (state as AppHistoryState)[HISTORY_STATE_KEY];
  return snapshot ?? null;
}

export function readHistorySession(state: unknown): number | null {
  if (typeof state !== "object" || state === null) {
    return null;
  }

  const session = (state as AppHistoryState)[HISTORY_SESSION_KEY];
  return typeof session === "number" ? session : null;
}

export function pushAppHistory(snapshot: NavigationSnapshot, session?: number): void {
  window.history.pushState(createHistoryState(snapshot, session), "", buildAppUrl(snapshot));
}

export function replaceAppHistory(snapshot: NavigationSnapshot, session?: number): void {
  window.history.replaceState(createHistoryState(snapshot, session), "", buildAppUrl(snapshot));
}
