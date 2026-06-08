import type { KinopoiskFilm } from "./kinopoisk";

export type KinoboxPlayerOption = {
  id: string;
  type: string;
  iframeUrl: string;
  translation?: string;
  quality?: string;
};

export type PlayerSource = {
  id: string;
  title: string;
  kinopoiskId?: number;
  embedUrl?: string;
  resolveEmbedUrl?: (options?: PlayerResolveOptions) => Promise<string | null>;
  resolveKinoboxPlayers?: (
    options?: PlayerResolveOptions
  ) => Promise<KinoboxPlayerOption[]>;
  kinoboxEmbedFallback?: string;
};

export type PlayerResolveOptions = {
  fetchImpl?: typeof fetch;
  allohaToken?: string;
  hdvbToken?: string;
  embedDomain?: string;
};

export type EmbedPlayerTemplate = {
  id: string;
  title: string;
  embedUrlTemplate: string;
};

export type AsyncPlayerTemplate = {
  id: string;
  title: string;
  resolveEmbedUrl: (
    kinopoiskId: number,
    options?: PlayerResolveOptions
  ) => Promise<string | null>;
};

export type KinoboxPlayerTemplate = {
  id: string;
  title: string;
  kinobox: true;
};

export type PlayerTemplate =
  | EmbedPlayerTemplate
  | AsyncPlayerTemplate
  | KinoboxPlayerTemplate;

export type PlayerRegistry = Record<string, PlayerTemplate>;

const ALLOHA_TOKEN = "e7b61f129f4a392ac4bf6726a9dd6a";
const COLL_TOKEN = "4c250f7ac0a8c8a658c789186b9a58a5";
const KODI_TOKEN = "41dd95f84c21719b09d6c71182237a25";
const KINOBOX_API_BASE_URL = "https://api.kinobox.tv/api";
const KINOBOX_EMBED_BASE_URL = "https://kinohost.web.app/embed";
const GEO_BLOCKED_PLAYER_HOSTS = ["stravers.live"];
const ALLOHA_EMBED_BASE_URL = "https://harald-as.newplayjj.com";
const DEFAULT_EMBED_DOMAIN = "nayteruz.github.io";

export function getDefaultEmbedDomain(): string {
  return import.meta.env.VITE_PLAYER_EMBED_DOMAIN?.trim() || DEFAULT_EMBED_DOMAIN;
}

export function buildAllohaEmbedUrl(
  kinopoiskId: number,
  token: string,
  embedDomain = getDefaultEmbedDomain()
): string {
  const params = new URLSearchParams({
    kp: String(kinopoiskId),
    token,
    domain: embedDomain
  });

  return `${ALLOHA_EMBED_BASE_URL}/?${params.toString()}`;
}

type KinoboxApiPlayer = {
  iframeUrl?: string;
  type?: string;
  translation?: string;
  quality?: string;
};

export function buildKinoboxPlayersUrl(
  kinopoiskId: number,
  embedDomain = getDefaultEmbedDomain()
): string {
  const params = new URLSearchParams({
    kinopoisk: String(kinopoiskId),
    domain: embedDomain
  });

  return `${KINOBOX_API_BASE_URL}/players?${params.toString()}`;
}

export function buildKinoboxEmbedFallbackUrl(
  kinopoiskId: number,
  embedDomain = getDefaultEmbedDomain()
): string {
  const params = new URLSearchParams({ domain: embedDomain });

  return `${KINOBOX_EMBED_BASE_URL}/${kinopoiskId}?${params.toString()}`;
}

export function formatKinoboxPlayerLabel(player: KinoboxPlayerOption): string {
  return [player.type, player.translation, player.quality].filter(Boolean).join(" · ");
}

function isSafeHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function enhanceKinoboxIframeUrl(url: string, embedDomain: string): string {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname.includes("newplayjj.com") &&
      !parsed.searchParams.has("domain")
    ) {
      parsed.searchParams.set("domain", embedDomain);
      return parsed.toString();
    }
  } catch {
    return url;
  }

  return url;
}

export function normalizeKinoboxPlayers(
  players: KinoboxApiPlayer[] | undefined,
  embedDomain = getDefaultEmbedDomain()
): KinoboxPlayerOption[] {
  const seen = new Set<string>();

  return (players ?? []).flatMap((player, index) => {
    if (!player.iframeUrl || !isSafeHttpsUrl(player.iframeUrl)) {
      return [];
    }

    const iframeUrl = enhanceKinoboxIframeUrl(player.iframeUrl, embedDomain);

    if (isGeoBlockedPlayerUrl(iframeUrl) || seen.has(iframeUrl)) {
      return [];
    }

    seen.add(iframeUrl);

    return [
      {
        id: `${player.type ?? "player"}-${index}`,
        type: player.type ?? "player",
        iframeUrl,
        translation: player.translation,
        quality: player.quality
      }
    ];
  });
}

export async function fetchKinoboxPlayers(
  kinopoiskId: number,
  options?: PlayerResolveOptions
): Promise<KinoboxPlayerOption[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const embedDomain = options?.embedDomain || getDefaultEmbedDomain();
  const response = await fetchImpl(buildKinoboxPlayersUrl(kinopoiskId, embedDomain), {
    headers: {
      Accept: "application/json",
      Origin: "https://kinohost.web.app",
      Referer: "https://kinohost.web.app/"
    }
  });

  if (!response.ok) {
    throw new Error(`Kinobox API request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: KinoboxApiPlayer[];
  };

  return normalizeKinoboxPlayers(payload.data, embedDomain);
}

export function isGeoBlockedPlayerUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    return GEO_BLOCKED_PLAYER_HOSTS.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return true;
  }
}

export function selectKinoboxIframeUrl(
  players: KinoboxApiPlayer[] | undefined,
  embedFallback: string,
  embedDomain = getDefaultEmbedDomain()
): string {
  const normalized = normalizeKinoboxPlayers(players, embedDomain);

  if (normalized.length === 0) {
    return embedFallback;
  }

  const preferred = normalized.find((player) => player.type.toLowerCase() !== "alloha");

  return (preferred ?? normalized[0]).iframeUrl;
}

export const players = {
  Alloha: {
    id: "alloha",
    title: "Alloha",
    resolveEmbedUrl: async (kinopoiskId, options) => {
      const token = options?.allohaToken || ALLOHA_TOKEN;
      const embedDomain = options?.embedDomain || getDefaultEmbedDomain();

      return buildAllohaEmbedUrl(kinopoiskId, token, embedDomain);
    }
  },
  Collaps: {
    id: "collaps",
    title: "Collaps",
    embedUrlTemplate: "https://api.atomics.ws/embed/kp/{kinopoiskId}"
  },
  VideoCDN: {
    id: "videocdn",
    title: "VideoCDN",
    embedUrlTemplate:
      "https://p.lumex.space/j3mqebEPqCLB?domain={embedDomain}&kp_id={kinopoiskId}"
  },
  Kinobox: {
    id: "kinobox",
    title: "Kinobox",
    kinobox: true
  },
  Coll: {
    id: "coll",
    title: "Coll",
    resolveEmbedUrl: async (kinopoiskId, options) => {
      const fetchImpl = options?.fetchImpl ?? fetch;
      const response = await fetchImpl(
        `https://api.bhcesh.me/list?token=${COLL_TOKEN}&kinopoisk_id=${kinopoiskId}`
      );
      const data = (await response.json()) as {
        results?: Array<{ iframe_url?: string }>;
      };

      return data.results?.[0]?.iframe_url ?? null;
    }
  },
  kodi: {
    id: "kodi",
    title: "kodi",
    resolveEmbedUrl: async (kinopoiskId, options) => {
      const fetchImpl = options?.fetchImpl ?? fetch;
      const response = await fetchImpl(
        `https://kodikapi.com/search?token=${KODI_TOKEN}&kinopoisk_id=${kinopoiskId}`
      );
      const data = (await response.json()) as {
        results?: Array<{ link?: string }>;
      };

      return data.results?.[0]?.link ?? null;
    }
  },
  HDVB: {
    id: "hdvb",
    title: "HDVB",
    resolveEmbedUrl: async (kinopoiskId, options) => {
      if (!options?.hdvbToken) {
        return null;
      }

      const fetchImpl = options.fetchImpl ?? fetch;
      const response = await fetchImpl(
        `https://apivb.com/api/videos.json?id_kp=${kinopoiskId}&token=${options.hdvbToken}`
      );
      const data = (await response.json()) as Array<{ iframe_url?: string }>;

      return data[0]?.iframe_url ?? null;
    }
  },
  Kodik: {
    id: "kodik",
    title: "Kodik",
    embedUrlTemplate: "https://kodik.cc/find-player?kinopoiskID={kinopoiskId}"
  },
  Трейлер: {
    id: "trailer",
    title: "Трейлер",
    embedUrlTemplate: "https://api.atomics.ws/embed/trailer-kp/{kinopoiskId}"
  }
} satisfies PlayerRegistry;

export function getDefaultPlayerTemplates({ includeAlloha = true } = {}): PlayerTemplate[] {
  return Object.values(players).filter(
    (template) => includeAlloha || template.id !== players.Alloha.id
  );
}

export const defaultPlayerTemplates = getDefaultPlayerTemplates();

export function createPlayerSources(
  film: KinopoiskFilm,
  templates: PlayerTemplate[]
): PlayerSource[] {
  return templates.map((template) => {
    if ("kinobox" in template) {
      const embedDomain = getDefaultEmbedDomain();

      return {
        id: template.id,
        title: template.title,
        kinopoiskId: film.kinopoiskId,
        resolveKinoboxPlayers: (options) =>
          fetchKinoboxPlayers(film.kinopoiskId, options),
        kinoboxEmbedFallback: buildKinoboxEmbedFallbackUrl(
          film.kinopoiskId,
          embedDomain
        )
      };
    }

    if ("resolveEmbedUrl" in template) {
      return {
        id: template.id,
        title: template.title,
        resolveEmbedUrl: (options) => template.resolveEmbedUrl(film.kinopoiskId, options)
      };
    }

    return {
      id: template.id,
      title: template.title,
      embedUrl: template.embedUrlTemplate
        .replaceAll("{kinopoiskId}", encodeURIComponent(String(film.kinopoiskId)))
        .replaceAll("{embedDomain}", encodeURIComponent(getDefaultEmbedDomain()))
        .replaceAll("{title}", encodeURIComponent(film.title))
        .replaceAll("{originalTitle}", encodeURIComponent(film.originalTitle ?? ""))
        .replaceAll("{year}", encodeURIComponent(film.year ?? ""))
    };
  });
}

export function resolvePlayerEmbedUrl(
  template: PlayerTemplate,
  kinopoiskId: number,
  options?: PlayerResolveOptions
): Promise<string | null> | string {
  if ("kinobox" in template) {
    return fetchKinoboxPlayers(kinopoiskId, options).then(
      (sources) =>
        sources.at(0)?.iframeUrl ??
        buildKinoboxEmbedFallbackUrl(kinopoiskId, options?.embedDomain)
    );
  }

  if ("resolveEmbedUrl" in template) {
    return template.resolveEmbedUrl(kinopoiskId, options);
  }

  if ("embedUrlTemplate" in template) {
    return template.embedUrlTemplate.replaceAll(
      "{kinopoiskId}",
      encodeURIComponent(String(kinopoiskId))
    );
  }

  return buildKinoboxEmbedFallbackUrl(kinopoiskId, options?.embedDomain);
}

export function parsePlayerTemplates(rawTemplates?: string): PlayerTemplate[] {
  if (!rawTemplates?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTemplates) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isPlayerTemplate);
  } catch {
    return [];
  }
}

function isPlayerTemplate(value: unknown): value is PlayerTemplate {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeTemplate = value as Record<string, unknown>;

  if (
    typeof maybeTemplate.id === "string" &&
    typeof maybeTemplate.title === "string" &&
    maybeTemplate.kinobox === true
  ) {
    return true;
  }

  return (
    typeof maybeTemplate.id === "string" &&
    typeof maybeTemplate.title === "string" &&
    typeof maybeTemplate.embedUrlTemplate === "string"
  );
}
