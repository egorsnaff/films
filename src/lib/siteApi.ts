export type WatchStatus = "watching" | "plan" | "waiting" | "watched" | "favorite";

export type AuthUser = {
  id: number;
  username: string;
};

export type UserFilmEntry = {
  kinopoiskId: number;
  lists: WatchStatus[];
  watchSeconds?: number;
  progressPercent?: number;
  updatedAt: string;
};

export type CachedListFilm = {
  kinopoiskId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  posterUrl?: string;
  rating?: string;
};

export type RecommendationMode = "cold" | "warm";

export type RecommendationResponse = {
  films: CachedListFilm[];
  mode: RecommendationMode;
  reason?: string;
};

const API_BASE = import.meta.env.VITE_SITE_API_BASE_URL?.replace(/\/+$/, "") || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `API request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const siteApi = {
  async getSession(): Promise<AuthUser | null> {
    try {
      const data = await request<{ user: AuthUser }>("/auth/me");
      return data.user;
    } catch {
      return null;
    }
  },

  async login(username: string, password: string): Promise<AuthUser> {
    const data = await request<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    return data.user;
  },

  async logout(): Promise<void> {
    await request<void>("/auth/logout", { method: "POST" });
  },

  async getLists(): Promise<{ items: UserFilmEntry[]; films: Record<number, CachedListFilm> }> {
    const data = await request<{ items: UserFilmEntry[]; films?: Record<number, CachedListFilm> }>(
      "/lists"
    );
    return { items: data.items, films: data.films ?? {} };
  },

  async toggleFilmList(
    kinopoiskId: number,
    status: WatchStatus,
    enabled: boolean
  ): Promise<UserFilmEntry | null> {
    const response = await fetch(`${API_BASE}/lists`, {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ kinopoiskId, status, enabled })
    });

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { item: UserFilmEntry };
    return data.item;
  },

  async updateWatchProgress(input: {
    kinopoiskId: number;
    watchSeconds: number;
    progressPercent: number;
    forceStatus?: WatchStatus;
  }): Promise<UserFilmEntry | null> {
    const response = await fetch(`${API_BASE}/lists/progress`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { item: UserFilmEntry };
    return data.item;
  },

  async getRecommendations(): Promise<RecommendationResponse> {
    return request<RecommendationResponse>("/recommendations");
  }
};

export const watchStatusLabels: Record<WatchStatus, string> = {
  favorite: "Любимое",
  watching: "Смотрю сейчас",
  plan: "Буду смотреть",
  waiting: "Жду продолжения",
  watched: "Просмотренное"
};
