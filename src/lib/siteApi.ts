export type WatchStatus = "watching" | "plan" | "waiting" | "watched";

export type AuthUser = {
  id: number;
  username: string;
};

export type UserFilmEntry = {
  kinopoiskId: number;
  status: WatchStatus;
  updatedAt: string;
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

  async getLists(): Promise<UserFilmEntry[]> {
    const data = await request<{ items: UserFilmEntry[] }>("/lists");
    return data.items;
  },

  async setFilmStatus(kinopoiskId: number, status: WatchStatus): Promise<UserFilmEntry> {
    const data = await request<{ item: UserFilmEntry }>("/lists", {
      method: "PUT",
      body: JSON.stringify({ kinopoiskId, status })
    });
    return data.item;
  },

  async removeFilm(kinopoiskId: number): Promise<void> {
    await request<void>(`/lists/${kinopoiskId}`, { method: "DELETE" });
  }
};

export const watchStatusLabels: Record<WatchStatus, string> = {
  watching: "Смотрю сейчас",
  plan: "Буду смотреть",
  waiting: "Жду продолжения",
  watched: "Просмотренное"
};
