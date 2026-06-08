import type { ThemeCollectionType, TopCollectionType } from "../lib/kinopoisk";

export type CollectionSource =
  | { kind: "top"; type: TopCollectionType }
  | { kind: "theme"; type: ThemeCollectionType };

export type FilmCollection = {
  id: string;
  title: string;
  description: string;
  accent: string;
  source: CollectionSource;
};

export const filmCollections: FilmCollection[] = [
  {
    id: "top-250",
    title: "250 лучших фильмов",
    description: "Официальный топ Кинопоиска — проверенная классика.",
    accent: "#f0b75b",
    source: { kind: "top", type: "TOP_250_BEST_FILMS" }
  },
  {
    id: "top-await",
    title: "Скоро в кино",
    description: "Самые ожидаемые премьеры по версии Кинопоиска.",
    accent: "#7eb6ff",
    source: { kind: "top", type: "TOP_AWAIT_FILMS" }
  },
  {
    id: "vampires",
    title: "Фильмы про вампиров",
    description: "Клыки, ночь и вечная любовь.",
    accent: "#c49bff",
    source: { kind: "theme", type: "VAMPIRE_THEME" }
  },
  {
    id: "zombies",
    title: "Фильмы про зомби",
    description: "Живые мертвецы и выживание.",
    accent: "#8fd98d",
    source: { kind: "theme", type: "ZOMBIE_THEME" }
  },
  {
    id: "love",
    title: "Про любовь и страсть",
    description: "Романтика, драма и сильные чувства.",
    accent: "#f06b42",
    source: { kind: "theme", type: "LOVE_THEME" }
  },
  {
    id: "family",
    title: "Семейный просмотр",
    description: "Фильмы, которые можно включить всей семьёй.",
    accent: "#e8dfd0",
    source: { kind: "theme", type: "FAMILY" }
  },
  {
    id: "comics",
    title: "По комиксам",
    description: "Супергерои и экранизации графических новелл.",
    accent: "#f5c66e",
    source: { kind: "theme", type: "COMICS_THEME" }
  },
  {
    id: "sci-fi",
    title: "Катастрофы и апокалипсис",
    description: "Когда мир рушится — но красиво.",
    accent: "#84d67d",
    source: { kind: "theme", type: "CATASTROPHE_THEME" }
  }
];

export function getCollectionById(id: string): FilmCollection | undefined {
  return filmCollections.find((collection) => collection.id === id);
}
