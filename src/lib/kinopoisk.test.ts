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
  it("sends the API key header and normalizes keyword search results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        films: [
          {
            filmId: 301,
            nameRu: "Матрица",
            nameEn: "The Matrix",
            year: "1999",
            posterUrlPreview: "https://example.test/matrix-small.jpg",
            rating: "8.5"
          }
        ]
      })
    });
    const client = createKinopoiskClient({
      apiKey: "test-key",
      fetchImpl: fetchMock
    });

    const films = await client.searchFilms("матрица");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=%D0%BC%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0&page=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-KEY": "test-key"
        })
      })
    );
    expect(films).toEqual([
      {
        kinopoiskId: 301,
        title: "Матрица",
        originalTitle: "The Matrix",
        year: "1999",
        posterUrl: "https://example.test/matrix-small.jpg",
        rating: "8.5"
      }
    ]);
  });

  it("loads film details from the v2.2 film endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        kinopoiskId: 435,
        nameRu: "Зелёная миля",
        nameOriginal: "The Green Mile",
        year: 1999,
        posterUrl: "https://example.test/green-mile.jpg",
        ratingKinopoisk: 9.1,
        description: "История блока смертников."
      })
    });
    const client = createKinopoiskClient({
      apiKey: "test-key",
      fetchImpl: fetchMock
    });

    const details = await client.getFilm(435);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://kinopoiskapiunofficial.tech/api/v2.2/films/435",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-KEY": "test-key"
        })
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

  it("drops Kinopoisk no-poster placeholders during normalization", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            kinopoiskId: 501,
            nameRu: "Без реального постера",
            posterUrlPreview:
              "https://kinopoiskapiunofficial.tech/images/posters/kp/no-poster.png"
          }
        ]
      })
    });
    const client = createKinopoiskClient({
      apiKey: "test-key",
      fetchImpl: fetchMock
    });

    const films = await client.getRecentFilms();

    expect(films).toEqual([
      {
        kinopoiskId: 501,
        title: "Без реального постера",
        posterUrl: undefined
      }
    ]);
  });

  it("loads a paginated default collection of recent films", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            kinopoiskId: 123,
            nameRu: "Новый фильм",
            nameOriginal: "New Film",
            year: 2026,
            posterUrlPreview: "https://example.test/new-film.jpg",
            ratingKinopoisk: 7.4
          }
        ]
      })
    });
    const client = createKinopoiskClient({
      apiKey: "test-key",
      fetchImpl: fetchMock
    });

    const films = await client.getRecentFilms(3);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://kinopoiskapiunofficial.tech/api/v2.2/films?order=YEAR&type=FILM&ratingFrom=6&ratingTo=10&yearFrom=2024&yearTo=2026&page=3",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-KEY": "test-key"
        })
      })
    );
    expect(films).toEqual([
      {
        kinopoiskId: 123,
        title: "Новый фильм",
        originalTitle: "New Film",
        year: "2026",
        posterUrl: "https://example.test/new-film.jpg",
        rating: "7.4"
      }
    ]);
  });
});
