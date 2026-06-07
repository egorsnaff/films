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
