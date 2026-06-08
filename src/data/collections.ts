export type FilmCollection = {
  id: string;
  title: string;
  description: string;
  accent: string;
  kinopoiskIds: number[];
};

export const filmCollections: FilmCollection[] = [
  {
    id: "evening-mood",
    title: "Вечер под плед",
    description: "Спокойные драмы и тёплые истории для расслабленного просмотра.",
    accent: "#f0b75b",
    kinopoiskIds: [435, 326, 258687, 535341, 1048334, 111543]
  },
  {
    id: "action-night",
    title: "Боевик на ночь",
    description: "Драйв, погони и взрывы — когда хочется адреналина.",
    accent: "#f06b42",
    kinopoiskIds: [301, 8124, 666564, 462682, 1044002, 843649]
  },
  {
    id: "sci-fi",
    title: "Фантастика и будущее",
    description: "Космос, технологии и альтернативные реальности.",
    accent: "#7eb6ff",
    kinopoiskIds: [258687, 301, 535341, 468466, 427076, 1044002]
  },
  {
    id: "family",
    title: "Семейный просмотр",
    description: "Фильмы, которые можно включить всей семьёй.",
    accent: "#8fd98d",
    kinopoiskIds: [1113011, 1048334, 535341, 462682, 843649, 111543]
  },
  {
    id: "series-binge",
    title: "Сериалы на выходные",
    description: "Истории в несколько сезонов — когда хочется марафона.",
    accent: "#c49bff",
    kinopoiskIds: [4049003, 1044002, 843649, 1113011, 535341, 468466]
  },
  {
    id: "classics",
    title: "Классика, которую стоит пересмотреть",
    description: "Проверенные временем фильмы с высоким рейтингом.",
    accent: "#e8dfd0",
    kinopoiskIds: [435, 326, 301, 8124, 258687, 111543]
  }
];

export function getCollectionById(id: string): FilmCollection | undefined {
  return filmCollections.find((collection) => collection.id === id);
}
