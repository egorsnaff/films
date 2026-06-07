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

export const players = {
  Alloha: {
    id: "alloha",
    title: "Alloha",
    resolveEmbedUrl: async (kinopoiskId, options) => {
      const fetchImpl = options?.fetchImpl ?? fetch;
      const token = options?.allohaToken || ALLOHA_TOKEN;
      const response = await fetchImpl(
        `https://api.apbugall.org/?token=${token}&kp=${kinopoiskId}`
      );
      const data = (await response.json()) as {
        data?: { iframe?: string };
      };

      return data.data?.iframe ?? null;
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

export const defaultPlayerTemplates = Object.values(players);

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
