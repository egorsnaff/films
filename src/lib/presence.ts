import type { CatalogMode, ViewState } from "./navigation";

export type PresenceActivity =
  | { kind: "watching"; kinopoiskId: number; title: string; posterUrl?: string }
  | { kind: "choosing" }
  | { kind: "searching" }
  | { kind: "catalog" }
  | { kind: "profile" };

export type PresenceStatus = PresenceActivity | { kind: "away" };

export type PresenceEntry = {
  id: number;
  username: string;
  online: boolean;
  activity?: PresenceStatus;
};

type LocalActivityInput = {
  view: ViewState;
  catalogMode: CatalogMode;
  film?: { kinopoiskId: number; title: string; posterUrl?: string } | null;
  playbackStarted: boolean;
};

export function resolveLocalActivity({
  view,
  catalogMode,
  film,
  playbackStarted
}: LocalActivityInput): PresenceActivity {
  if (view === "watch") {
    if (film && playbackStarted) {
      return {
        kind: "watching",
        kinopoiskId: film.kinopoiskId,
        title: film.title,
        ...(film.posterUrl ? { posterUrl: film.posterUrl } : {})
      };
    }

    return { kind: "choosing" };
  }

  if (view === "profile") {
    return { kind: "profile" };
  }

  if (view === "catalog" && catalogMode === "search") {
    return { kind: "searching" };
  }

  return { kind: "catalog" };
}

const COLLAPSED_STORAGE_KEY = "films:presence-collapsed";

export function readPresenceCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored !== null) {
      return stored === "1";
    }
  } catch {
    // localStorage может быть недоступен (приватный режим).
  }

  return typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 720px)").matches
    : false;
}

export function writePresenceCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Состояние панели просто не запомнится.
  }
}

const statusLabels: Record<Exclude<PresenceStatus["kind"], "watching">, string> = {
  choosing: "выбирает фильм",
  searching: "ищет фильм",
  catalog: "в каталоге",
  profile: "в профиле",
  away: "отошёл"
};

export function describePresence(entry: PresenceEntry): string {
  if (!entry.online || !entry.activity) {
    return "не в сети";
  }

  if (entry.activity.kind === "watching") {
    return "смотрит";
  }

  return statusLabels[entry.activity.kind];
}
