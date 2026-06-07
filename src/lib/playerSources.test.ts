import { describe, expect, it } from "vitest";

import { createPlayerSources, defaultPlayerTemplates, players } from "./playerSources";

describe("createPlayerSources", () => {
  it("builds embed player URLs from configured templates", () => {
    const players = createPlayerSources(
      {
        kinopoiskId: 301,
        title: "Матрица",
        originalTitle: "The Matrix",
        year: "1999",
        posterUrl: "https://example.test/poster.jpg",
        rating: "8.5"
      },
      [
        {
          id: "custom",
          title: "Мой сервер",
          embedUrlTemplate:
            "https://watch.example.test/embed?kp={kinopoiskId}&title={title}"
        }
      ]
    );

    expect(players).toEqual([
      {
        id: "custom",
        title: "Мой сервер",
        embedUrl:
          "https://watch.example.test/embed?kp=301&title=%D0%9C%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0"
      }
    ]);
  });

  it("provides default players with Alloha token and trailer fallback", () => {
    expect(Object.keys(players)).toEqual([
      "Alloha",
      "Collaps",
      "VideoCDN",
      "Coll",
      "kodi",
      "HDVB",
      "Kodik",
      "Трейлер"
    ]);

    const sources = createPlayerSources(
      {
        kinopoiskId: 312,
        title: "Матрица",
        originalTitle: "The Matrix",
        year: "1999",
        posterUrl: "https://example.test/poster.jpg",
        rating: "8.5"
      },
      defaultPlayerTemplates
    );

    expect(sources).toEqual([
      {
        id: "alloha",
        title: "Alloha",
        embedUrl:
          "https://harald-as.newplayjj.com/?kp=312&token=e7b61f129f4a392ac4bf6726a9dd6a"
      },
      {
        id: "trailer",
        title: "Трейлер",
        embedUrl:
          "https://www.youtube.com/embed?listType=search&list=%D0%9C%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0%201999%20%D1%82%D1%80%D0%B5%D0%B9%D0%BB%D0%B5%D1%80"
      }
    ]);
  });
});
