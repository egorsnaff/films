import type { KinopoiskFilm } from "./kinopoisk";

export type PlayerSource = {
  id: string;
  title: string;
  embedUrl?: string;
  resolveEmbedUrl?: (options?: PlayerResolveOptions) => Promise<string | null>;
};

export type PlayerResolveOptions = {
  fetchImpl?: typeof fetch;
  allohaToken?: string;
  hdvbToken?: string;
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

export type PlayerTemplate = EmbedPlayerTemplate | AsyncPlayerTemplate;

export type PlayerRegistry = Record<string, PlayerTemplate>;

const ALLOHA_TOKEN = "e7b61f129f4a392ac4bf6726a9dd6a";
const COLL_TOKEN = "4c250f7ac0a8c8a658c789186b9a58a5";
const KODI_TOKEN = "41dd95f84c21719b09d6c71182237a25";
const KINOBOX_API_BASE_URL = "https://api.kinobox.tv/api";
const KINOBOX_EMBED_BASE_URL = "https://kinohost.web.app/embed";
const GEO_BLOCKED_PLAYER_HOSTS = ["stravers.live"];
const ALLOHA_EMBED_BASE_URL = "https://harald-as.newplayjj.com";

type KinoboxPlayer = {
  iframeUrl?: string;
  type?: string;
};

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
  players: KinoboxPlayer[] | undefined,
  embedFallback: string
): string {
  const candidates = (players ?? []).filter((player): player is KinoboxPlayer & {
    iframeUrl: string;
  } => {
    if (!player.iframeUrl) {
      return false;
    }

    return !isGeoBlockedPlayerUrl(player.iframeUrl);
  });

  if (candidates.length === 0) {
    return embedFallback;
  }

  const preferred = candidates.find((player) => player.type?.toLowerCase() !== "alloha");

  return (preferred ?? candidates[0]).iframeUrl;
}

export const players = {
  Alloha: {
    id: "alloha",
    title: "Alloha",
    resolveEmbedUrl: async (kinopoiskId, options) => {
      const token = options?.allohaToken || ALLOHA_TOKEN;

      return `${ALLOHA_EMBED_BASE_URL}/?kp=${kinopoiskId}&token=${token}`;
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
      "https://p.lumex.space/j3mqebEPqCLB?domain=nayteruz.github.io&kp_id={kinopoiskId}"
  },
  Kinobox: {
    id: "kinobox",
    title: "Kinobox",
    resolveEmbedUrl: async (kinopoiskId, options) => {
      const fetchImpl = options?.fetchImpl ?? fetch;
      const embedFallback = `${KINOBOX_EMBED_BASE_URL}/${kinopoiskId}`;

      try {
        const response = await fetchImpl(
          `${KINOBOX_API_BASE_URL}/players?kinopoisk=${kinopoiskId}`,
          {
            headers: {
              Accept: "application/json",
              Origin: "https://kinohost.web.app",
              Referer: "https://kinohost.web.app/"
            }
          }
        );

        if (!response.ok) {
          return embedFallback;
        }

        const payload = (await response.json()) as {
          data?: KinoboxPlayer[];
        };

        return selectKinoboxIframeUrl(payload.data, embedFallback);
      } catch {
        return embedFallback;
      }
    }
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
  if ("resolveEmbedUrl" in template) {
    return template.resolveEmbedUrl(kinopoiskId, options);
  }

  return template.embedUrlTemplate.replaceAll(
    "{kinopoiskId}",
    encodeURIComponent(String(kinopoiskId))
  );
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

  return (
    typeof maybeTemplate.id === "string" &&
    typeof maybeTemplate.title === "string" &&
    typeof maybeTemplate.embedUrlTemplate === "string"
  );
}
