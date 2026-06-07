import type { KinopoiskFilm } from "./kinopoisk";

export type PlayerSource = {
  id: string;
  title: string;
  embedUrl: string;
};

export type PlayerTemplate = {
  id: string;
  title: string;
  embedUrlTemplate: string;
};

export type PlayerRegistry = Record<string, PlayerTemplate | null>;

const ALLOHA_TOKEN = "e7b61f129f4a392ac4bf6726a9dd6a";

export const players = {
  Alloha: {
    id: "alloha",
    title: "Alloha",
    embedUrlTemplate: `https://harald-as.newplayjj.com/?kp={kinopoiskId}&token=${ALLOHA_TOKEN}`
  },
  Collaps: null,
  VideoCDN: null,
  Coll: null,
  kodi: null,
  HDVB: null,
  Kodik: null,
  Трейлер: {
    id: "trailer",
    title: "Трейлер",
    embedUrlTemplate:
      "https://www.youtube.com/embed?listType=search&list={title}%20{year}%20%D1%82%D1%80%D0%B5%D0%B9%D0%BB%D0%B5%D1%80"
  }
} satisfies PlayerRegistry;

export const defaultPlayerTemplates = Object.values(players).filter(isPlayerTemplate);

export function createPlayerSources(
  film: KinopoiskFilm,
  templates: PlayerTemplate[]
): PlayerSource[] {
  return templates.map((template) => ({
    id: template.id,
    title: template.title,
    embedUrl: template.embedUrlTemplate
      .replaceAll("{kinopoiskId}", encodeURIComponent(String(film.kinopoiskId)))
      .replaceAll("{title}", encodeURIComponent(film.title))
      .replaceAll("{originalTitle}", encodeURIComponent(film.originalTitle ?? ""))
      .replaceAll("{year}", encodeURIComponent(film.year ?? ""))
  }));
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
