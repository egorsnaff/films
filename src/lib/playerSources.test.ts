import { describe, expect, it } from "vitest";

import { createPlayerSources } from "./playerSources";

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
});
