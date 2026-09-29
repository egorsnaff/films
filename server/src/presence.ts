export type PresenceActivity =
  | { kind: "watching"; kinopoiskId: number; title: string; posterUrl?: string }
  | { kind: "choosing" }
  | { kind: "searching" }
  | { kind: "catalog" }
  | { kind: "profile" };

export type PresenceStatus = PresenceActivity | { kind: "away" };

export type PresenceUser = {
  id: number;
  username: string;
};

export type PresenceEntry = PresenceUser & {
  online: boolean;
  activity?: PresenceStatus;
};

type TabState = {
  activity: PresenceActivity;
  visible: boolean;
  seenAt: number;
  changedAt: number;
};

export const PRESENCE_TTL_MS = 90_000;

const MAX_TABS_PER_USER = 8;
const MAX_TITLE_LENGTH = 200;
const SIMPLE_KINDS = new Set(["choosing", "searching", "catalog", "profile"]);

export function parsePresenceActivity(value: unknown): PresenceActivity | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const raw = value as Record<string, unknown>;

  if (raw.kind === "watching") {
    const kinopoiskId = Number(raw.kinopoiskId);
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
    if (!Number.isInteger(kinopoiskId) || kinopoiskId <= 0 || !title) {
      return null;
    }

    const posterUrl =
      typeof raw.posterUrl === "string" && /^https:\/\//.test(raw.posterUrl)
        ? raw.posterUrl.slice(0, 500)
        : undefined;

    return { kind: "watching", kinopoiskId, title, ...(posterUrl ? { posterUrl } : {}) };
  }

  if (typeof raw.kind === "string" && SIMPLE_KINDS.has(raw.kind)) {
    return { kind: raw.kind } as PresenceActivity;
  }

  return null;
}

function isSameActivity(left: PresenceActivity, right: PresenceActivity): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createPresenceStore(now: () => number = Date.now) {
  const tabsByUser = new Map<number, Map<string, TabState>>();

  function prune(userId: number): Map<string, TabState> | undefined {
    const tabs = tabsByUser.get(userId);
    if (!tabs) {
      return undefined;
    }

    const threshold = now() - PRESENCE_TTL_MS;
    for (const [tabId, tab] of tabs) {
      if (tab.seenAt < threshold) {
        tabs.delete(tabId);
      }
    }

    if (tabs.size === 0) {
      tabsByUser.delete(userId);
      return undefined;
    }

    return tabs;
  }

  function update(
    userId: number,
    tabId: string,
    activity: PresenceActivity,
    visible: boolean
  ): void {
    const tabs = tabsByUser.get(userId) ?? new Map<string, TabState>();
    const previous = tabs.get(tabId);
    const timestamp = now();

    tabs.set(tabId, {
      activity,
      visible,
      seenAt: timestamp,
      changedAt:
        previous && isSameActivity(previous.activity, activity) && previous.visible === visible
          ? previous.changedAt
          : timestamp
    });

    if (tabs.size > MAX_TABS_PER_USER) {
      const oldest = [...tabs.entries()].sort((left, right) => left[1].seenAt - right[1].seenAt)[0];
      tabs.delete(oldest[0]);
    }

    tabsByUser.set(userId, tabs);
  }

  function leave(userId: number, tabId: string): void {
    tabsByUser.get(userId)?.delete(tabId);
    prune(userId);
  }

  function resolve(userId: number): PresenceStatus | undefined {
    const tabs = prune(userId);
    if (!tabs) {
      return undefined;
    }

    const states = [...tabs.values()];
    const watching = states
      .filter((tab) => tab.activity.kind === "watching")
      .sort((left, right) => right.changedAt - left.changedAt)[0];
    if (watching) {
      return watching.activity;
    }

    const visible = states
      .filter((tab) => tab.visible)
      .sort((left, right) => right.changedAt - left.changedAt)[0];

    return visible ? visible.activity : { kind: "away" };
  }

  function list(users: PresenceUser[], viewerId: number): PresenceEntry[] {
    return users
      .filter((user) => user.id !== viewerId)
      .map((user) => {
        const activity = resolve(user.id);
        return activity
          ? { id: user.id, username: user.username, online: true, activity }
          : { id: user.id, username: user.username, online: false };
      })
      .sort(
        (left, right) =>
          Number(right.online) - Number(left.online) || left.username.localeCompare(right.username)
      );
  }

  return { update, leave, resolve, list };
}
