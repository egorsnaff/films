import { describe, expect, it, vi } from "vitest";

import { createKinopoiskClient, hasValidPosterUrl, normalizeClientPosterUrl } from "./kinopoisk";

describe("hasValidPosterUrl", () => {
  it("rejects Kinopoisk placeholder poster urls", () => {
    expect(
      hasValidPosterUrl("https://kinopoiskapiunofficial.tech/images/posters/kp/no-poster.png")
    ).toBe(false);
    expect(hasValidPosterUrl("https://example.test/no-poster.jpg")).toBe(false);
    expect(hasValidPosterUrl(undefined)).toBe(false);
    expect(hasValidPosterUrl("   ")).toBe(false);
    expect(hasValidPosterUrl("https://example.test/real-poster.jpg")).toBe(true);
  });
});

describe("normalizeClientPosterUrl", () => {
  it("upgrades kp_small thumbs to full posters", () => {
    expect(
      normalizeClientPosterUrl(
        "https://kinopoiskapiunofficial.tech/images/posters/kp_small/346.jpg"
      )
    ).toBe("https://kinopoiskapiunofficial.tech/images/posters/kp/346.jpg");
  });
});

describe("createKinopoiskClient", () => {
  it("loads search results through the Kinopoisk proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          films: [
            {
              kinopoiskId: 301,
              title: "Матрица",
              originalTitle: "The Matrix",
              year: "1999",
              posterUrl: "https://example.test/matrix-small.jpg",
              rating: "8.5"
            }
          ],
          page: 1,
          totalPages: 4
        }
      })
    });
    const client = createKinopoiskClient({
      fetchImpl: fetchMock,
      proxyBaseUrl: "/api"
    });

    const page = await client.searchFilms("матрица");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kp/search?keyword=%D0%BC%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0&page=1",
      expect.objectContaining({
        credentials: "include"
      })
    );
    expect(page).toEqual({
      page: 1,
      totalPages: 4,
      films: [
        {
          kinopoiskId: 301,
          title: "Матрица",
          originalTitle: "The Matrix",
          year: "1999",
          posterUrl: "https://example.test/matrix-small.jpg",
          rating: "8.5"
        }
      ]
    });
  });

  it("loads film details through the Kinopoisk proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        film: {
          kinopoiskId: 435,
          title: "Зелёная миля",
          originalTitle: "The Green Mile",
          year: "1999",
          posterUrl: "https://example.test/green-mile.jpg",
          rating: "9.1",
          description: "История блока смертников."
        }
      })
    });
    const client = createKinopoiskClient({
      fetchImpl: fetchMock,
      proxyBaseUrl: "/api"
    });

    const details = await client.getFilm(435);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kp/films/435",
      expect.objectContaining({
        credentials: "include"
      })
    );
    expect(details).toMatchObject({
      kinopoiskId: 435,
      title: "Зелёная миля",
      originalTitle: "The Green Mile",
      year: "1999",
      posterUrl: "https://example.test/green-mile.jpg",
      rating: "9.1",
      description: "История блока смертников."
    });
  });

  it("loads recent catalog pages through the Kinopoisk proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          films: [
            {
              kinopoiskId: 123,
              title: "Новый фильм",
              originalTitle: "New Film",
              year: "2026",
              posterUrl: "https://example.test/new-film.jpg",
              rating: "7.4"
            }
          ],
          page: 3,
          totalPages: 7
        }
      })
    });
    const client = createKinopoiskClient({
      fetchImpl: fetchMock,
      proxyBaseUrl: "/api"
    });

    const page = await client.getRecentFilms(3);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kp/catalog/recent?type=FILM&page=3",
      expect.objectContaining({
        credentials: "include"
      })
    );
    expect(page).toEqual({
      page: 3,
      totalPages: 7,
      films: [
        {
          kinopoiskId: 123,
          title: "Новый фильм",
          originalTitle: "New Film",
          year: "2026",
          posterUrl: "https://example.test/new-film.jpg",
          rating: "7.4"
        }
      ]
    });
  });

  it("ignores stale empty catalog cache entries and refetches", async () => {
    window.localStorage.setItem(
      "films-kp:v2:theme:TOP_POPULAR_MOVIES:5",
      JSON.stringify({
        savedAt: Date.now(),
        payload: {
          films: [],
          page: 1,
          totalPages: 1
        }
      })
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        page: {
          films: [
            {
              kinopoiskId: 501,
              title: "Свежая страница",
              posterUrl: "https://example.test/fresh.jpg"
            }
          ],
          page: 5,
          totalPages: 35
        }
      })
    });
    const client = createKinopoiskClient({
      fetchImpl: fetchMock,
      proxyBaseUrl: "/api"
    });

    const page = await client.getThemeFilms("TOP_POPULAR_MOVIES", 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(page.films[0]?.title).toBe("Свежая страница");
  });

  it("loads similar films through the Kinopoisk proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        films: [
          {
            kinopoiskId: 312,
            title: "Матрица: Перезагрузка",
            year: "2003",
            posterUrl: "https://example.test/reloaded.jpg",
            rating: "7.8"
          }
        ]
      })
    });
    const client = createKinopoiskClient({
      fetchImpl: fetchMock,
      proxyBaseUrl: "/api"
    });

    const films = await client.getSimilarFilms(301);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kp/films/301/similars",
      expect.objectContaining({
        credentials: "include"
      })
    );
    expect(films).toEqual([
      {
        kinopoiskId: 312,
        title: "Матрица: Перезагрузка",
        year: "2003",
        posterUrl: "https://example.test/reloaded.jpg",
        rating: "7.8"
      }
    ]);
  });
});
