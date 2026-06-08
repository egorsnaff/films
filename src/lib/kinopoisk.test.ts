import { describe, expect, it, vi } from "vitest";

import { createKinopoiskClient, hasValidPosterUrl } from "./kinopoisk";

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
});
