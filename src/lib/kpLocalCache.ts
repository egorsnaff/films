const STORAGE_PREFIX = "films-kp:";

const TTL_MS = {
  film: 7 * 24 * 60 * 60 * 1000,
  catalog: 6 * 60 * 60 * 1000,
  search: 2 * 60 * 60 * 1000,
  list: 24 * 60 * 60 * 1000
} as const;

type CacheKind = keyof typeof TTL_MS;

type CacheEntry<T> = {
  savedAt: number;
  payload: T;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readLocalCache<T>(key: string, kind: CacheKind): T | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) {
      return null;
    }

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.savedAt > TTL_MS[kind]) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return null;
    }

    return entry.payload;
  } catch {
    return null;
  }
}

export function writeLocalCache<T>(key: string, payload: T): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    const entry: CacheEntry<T> = {
      savedAt: Date.now(),
      payload
    };
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // ignore quota errors
  }
}
