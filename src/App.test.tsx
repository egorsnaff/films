import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { IMDB_FILMS_SHELF_TITLE } from "./data/imdbShelves";
import { buildAppUrl, createHomeSnapshot } from "./lib/appRoutes";

type MockFilm = {
  kinopoiskId: number;
  title: string;
  year?: string;
  posterUrl?: string;
  rating?: string;
  imdbRating?: string;
  description?: string;
};

function catalogResponse(films: MockFilm[], page = 1, totalPages = 1) {
  return {
    ok: true,
    json: async () => ({
      page: { films, page, totalPages }
    })
  };
}

function filmResponse(film: MockFilm) {
  return {
    ok: true,
    json: async () => ({ film })
  };
}

type FetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

function mockTopCatalog(
  url: string,
  options: {
    imdbFilms?: MockFilm[];
    feedFilms?: MockFilm[];
    feedPage?: number;
    feedTotalPages?: number;
  }
): FetchResponse | undefined {
  if (!url.includes("/api/kp/top")) {
    return undefined;
  }

  if (url.includes("IMDB_TOP_250")) {
    return catalogResponse(options.imdbFilms ?? [], 1, 13);
  }

  if (url.includes("TOP_100_POPULAR_FILMS")) {
    return catalogResponse(
      options.feedFilms ?? [],
      options.feedPage ?? 1,
      options.feedTotalPages ?? 1
    );
  }

  return undefined;
}

function createFetchMock(handlers: (url: string) => FetchResponse | undefined) {
  return vi.fn().mockImplementation((input: RequestInfo) => {
    const url = String(input);

    if (url.includes("/api/auth") || url.includes("/api/lists")) {
      return Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: "Не авторизован" })
      });
    }

    const custom = handlers(url);
    if (custom) {
      return Promise.resolve(custom);
    }

    if (
      url.includes("/api/kp/collections") ||
      url.includes("/api/kp/top") ||
      url.includes("/api/kp/catalog/recent")
    ) {
      return Promise.resolve(catalogResponse([]));
    }

    if (url.includes("/similars")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ films: [] })
      });
    }

    return Promise.resolve(catalogResponse([]));
  });
}

class NoopIntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(_callback: IntersectionObserverCallback) {}

  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("App", () => {
  const originalIntersectionObserver = window.IntersectionObserver;

  beforeEach(() => {
    window.localStorage.clear();
    // Reset to a clean entry so prior tests' pushState stack does not leak URLs.
    window.history.replaceState(null, "", "/");
    window.IntersectionObserver =
      NoopIntersectionObserver as unknown as typeof IntersectionObserver;
    vi.stubGlobal("fetch", createFetchMock(() => undefined));
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    window.IntersectionObserver = originalIntersectionObserver;
    vi.restoreAllMocks();
  });

  it("renders top menu and keeps search collapsed until the icon is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    const header = screen.getByRole("banner", { name: "Навигация" });

    expect(screen.getByRole("button", { name: "Фильмы" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сериалы" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Каталог" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Профиль" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Поиск фильма" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Открыть поиск" }));

    expect(header).toContainElement(screen.getByRole("searchbox", { name: "Поиск фильма" }));
    expect(screen.queryByRole("button", { name: "Фильмы" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сериалы" })).not.toBeInTheDocument();
  });

  it("renders a default premieres collection on the home page", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock((url) =>
        mockTopCatalog(url, {
          imdbFilms: [
            {
              kinopoiskId: 326,
              title: "Побег из Шоушенка",
              year: "1994",
              posterUrl: "https://example.test/imdb-shelf.jpg"
            }
          ],
          feedFilms: [
            {
              kinopoiskId: 77,
              title: "Премьера недели",
              year: "2026",
              posterUrl: "https://example.test/premiere.jpg",
              rating: "7.7"
            }
          ],
          feedTotalPages: 3
        })
      )
    );

    render(<App />);

    expect(await screen.findByRole("button", { name: IMDB_FILMS_SHELF_TITLE })).toBeInTheDocument();
    expect(await screen.findByText("Побег из Шоушенка")).toBeInTheDocument();
    expect(await screen.findByText("Премьера недели")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить ещё" })).toBeInTheDocument();
  });

  it("opens the full IMDb top list when the shelf title is clicked", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      createFetchMock((url) => {
        const top = mockTopCatalog(url, {
          imdbFilms: [
            {
              kinopoiskId: 326,
              title: "Побег из Шоушенка",
              year: "1994",
              posterUrl: "https://example.test/imdb-shelf.jpg"
            }
          ],
          feedFilms: [
            {
              kinopoiskId: 77,
              title: "Премьера недели",
              year: "2026",
              posterUrl: "https://example.test/premiere.jpg"
            }
          ]
        });
        if (top) {
          return top;
        }

        return undefined;
      })
    );

    render(<App />);

    await user.click(await screen.findByRole("button", { name: IMDB_FILMS_SHELF_TITLE }));

    expect(
      await screen.findByRole("heading", { name: IMDB_FILMS_SHELF_TITLE })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Побег из Шоушенка").length).toBeGreaterThan(0);
  });

  it("opens the full IMDb top list when the shelf show-more card is clicked", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      createFetchMock((url) => {
        const top = mockTopCatalog(url, {
          imdbFilms: [
            {
              kinopoiskId: 326,
              title: "Побег из Шоушенка",
              year: "1994",
              posterUrl: "https://example.test/imdb-shelf.jpg"
            }
          ],
          feedFilms: [
            {
              kinopoiskId: 77,
              title: "Премьера недели",
              year: "2026",
              posterUrl: "https://example.test/premiere.jpg"
            }
          ]
        });
        if (top) {
          return top;
        }

        return undefined;
      })
    );

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Показать ещё" }));

    expect(
      await screen.findByRole("heading", { name: IMDB_FILMS_SHELF_TITLE })
    ).toBeInTheDocument();
  });

  it("hides premieres without posters on the home page", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock((url) =>
        mockTopCatalog(url, {
          feedFilms: [
            {
              kinopoiskId: 11,
              title: "С постером",
              year: "2026",
              posterUrl: "https://example.test/with-poster.jpg"
            },
            {
              kinopoiskId: 12,
              title: "Без постера",
              year: "2026"
            },
            {
              kinopoiskId: 13,
              title: "Заглушка постера",
              year: "2026",
              posterUrl: "https://kinopoiskapiunofficial.tech/images/posters/kp/no-poster.png"
            }
          ]
        })
      )
    );

    render(<App />);

    expect(await screen.findByText("С постером")).toBeInTheDocument();
    expect(screen.queryByText("Без постера")).not.toBeInTheDocument();
    expect(screen.queryByText("Заглушка постера")).not.toBeInTheDocument();
    expect(screen.queryByText("Нет постера")).not.toBeInTheDocument();
  });

  it("loads home section after leaving a filtered catalog view", async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock((url) => {
      if (url.includes("/api/kp/filters")) {
        return {
          ok: true,
          json: async () => ({
            genres: [{ id: 1, genre: "драма" }],
            countries: []
          })
        };
      }

      if (url.includes("/api/kp/catalog/filter")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 501,
              title: "Фильтрованная драма",
              year: "2024",
              posterUrl: "https://example.test/filtered.jpg"
            }
          ],
          1,
          3
        );
      }

      if (url.includes("/api/kp/top")) {
        return (
          mockTopCatalog(url, {
            feedFilms: [
              {
                kinopoiskId: 77,
                title: "Премьера недели",
                year: "2026",
                posterUrl: "https://example.test/premiere.jpg"
              }
            ],
            feedTotalPages: 3
          }) ?? catalogResponse([])
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Каталог" }));
    await user.click(await screen.findByRole("button", { name: "драма" }));

    expect(await screen.findByText("Фильтрованная драма")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Фильмы" }));

    expect(await screen.findByText("Премьера недели")).toBeInTheDocument();
    expect(screen.queryByText("Фильтрованная драма")).not.toBeInTheDocument();
  });

  it("loads the next catalog page when the user scrolls near the bottom", async () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 4000
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 2800,
      writable: true
    });

    const fetchMock = createFetchMock((url) => {
      if (url.includes("page=2")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 88,
              title: "Вторая страница",
              year: "2026",
              posterUrl: "https://example.test/page-2.jpg"
            }
          ],
          2,
          3
        );
      }

      if (url.includes("/api/kp/top")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 77,
              title: "Первая страница",
              year: "2026",
              posterUrl: "https://example.test/page-1.jpg"
            }
          ],
          1,
          3
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Первая страница")).toBeInTheDocument();
    window.dispatchEvent(new Event("scroll"));

    await waitFor(() => {
      expect(screen.getByText("Вторая страница")).toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true);
  });

  it("does not paginate search results", async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock((url) => {
      if (url.includes("/api/kp/search")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 99,
              title: "Поисковый фильм",
              year: "2024",
              posterUrl: "https://example.test/search.jpg"
            }
          ],
          1,
          3
        );
      }

      if (url.includes("/api/kp/top")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 1,
              title: "Каталог",
              year: "2026",
              posterUrl: "https://example.test/catalog.jpg"
            }
          ],
          1,
          1
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Каталог")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Открыть поиск" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск фильма" }), "тест");
    await user.click(screen.getByRole("button", { name: "Найти" }));

    expect(await screen.findByText("Поисковый фильм")).toBeInTheDocument();
    expect(screen.queryByText("Листайте дальше")).not.toBeInTheDocument();

    const searchCallsBefore = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/kp/search")
    ).length;

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/kp/search")).length
      ).toBe(searchCallsBefore);
    });
  });


  it("keeps search results as new-tab links to watch pages", async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock((url) => {
      if (url.includes("/api/kp/search")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 1,
              title: "Первый",
              year: "2001",
              posterUrl: "https://example.test/one.jpg"
            },
            {
              kinopoiskId: 2,
              title: "Второй",
              year: "2002",
              posterUrl: "https://example.test/two.jpg"
            }
          ],
          1,
          1
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Открыть поиск" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск фильма" }), "первый");
    await user.click(screen.getByRole("button", { name: "Найти" }));

    const first = await screen.findByRole("link", { name: /Первый/ });
    const second = screen.getByRole("link", { name: /Второй/ });
    expect(first).toHaveAttribute("target", "_blank");
    expect(first).toHaveAttribute("href", expect.stringMatching(/\/watch\/1\/?$/));
    expect(second).toHaveAttribute("target", "_blank");
    expect(second).toHaveAttribute("href", expect.stringMatching(/\/watch\/2\/?$/));
  });

  it("opens players on a dedicated watch page", async () => {
    window.history.replaceState(
      null,
      "",
      buildAppUrl({
        ...createHomeSnapshot(),
        view: "watch",
        filmId: 301
      })
    );

    const fetchMock = createFetchMock((url) => {
      if (url.endsWith("/api/kp/films/301")) {
        return filmResponse({
          kinopoiskId: 301,
          title: "Матрица",
          year: "1999",
          posterUrl: "https://example.test/matrix.jpg",
          rating: "8.5",
          description: "Фильм о выборе реальности."
        });
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Матрица" })).toBeInTheDocument();
    expect(screen.getByText("Фильм о выборе реальности.")).toBeInTheDocument();
    expect(screen.getByLabelText("Плееры")).toBeInTheDocument();
    expect(screen.queryByText("Популярное сейчас")).not.toBeInTheDocument();
  });

  it("links catalog films to watch URLs in a new tab", async () => {
    const fetchMock = createFetchMock((url) => {
      if (url.includes("/api/kp/top")) {
        return (
          mockTopCatalog(url, {
            imdbFilms: [
              {
                kinopoiskId: 301,
                title: "Матрица",
                year: "1999",
                posterUrl: "https://example.test/matrix.jpg",
                rating: "8.5"
              }
            ],
            feedFilms: [
              {
                kinopoiskId: 301,
                title: "Матрица",
                year: "1999",
                posterUrl: "https://example.test/matrix.jpg",
                rating: "8.5"
              }
            ]
          }) ?? catalogResponse([])
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const link = await screen.findByRole("link", { name: /Матрица/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("href", expect.stringMatching(/\/watch\/301\/?$/));
    expect(window.location.pathname).not.toMatch(/\/watch\//);
  });

  it("shows watching shelf before favorites on the profile page", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = String(input);

        if (url.includes("/api/auth/me")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ user: { id: 1, username: "viewer" } })
          });
        }

        if (url.includes("/api/lists")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              items: [
                { kinopoiskId: 1, lists: ["favorite"] },
                { kinopoiskId: 2, lists: ["watching"] }
              ],
              films: {
                1: {
                  kinopoiskId: 1,
                  title: "Любимый фильм",
                  year: "1999",
                  posterUrl: "https://example.test/fav.jpg"
                },
                2: {
                  kinopoiskId: 2,
                  title: "Смотрю фильм",
                  year: "2000",
                  posterUrl: "https://example.test/watch.jpg"
                }
              }
            })
          });
        }

        if (url.includes("/api/kp/top")) {
          return Promise.resolve(catalogResponse([]));
        }

        return Promise.resolve(catalogResponse([]));
      })
    );

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Профиль" }));

    const shelves = await screen.findAllByRole("heading", {
      name: /Смотрю сейчас|Любимое|Буду смотреть|Жду продолжения|Просмотренное/
    });
    const titles = shelves.map((node) => node.textContent);
    expect(titles.indexOf("Смотрю сейчас")).toBeLessThan(titles.indexOf("Любимое"));
  });

  it("opens profile shelf films in a new tab", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ user: { id: 1, username: "viewer" } })
        });
      }

      if (url.includes("/api/lists")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ kinopoiskId: 301, lists: ["plan"] }],
            films: {
              301: {
                kinopoiskId: 301,
                title: "Матрица",
                year: "1999",
                posterUrl: "https://example.test/matrix.jpg",
                rating: "8.5"
              }
            }
          })
        });
      }

      if (url.includes("/api/kp/collections")) {
        return Promise.resolve(catalogResponse([]));
      }

      return Promise.resolve(catalogResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Профиль" }));
    expect(await screen.findByText("Буду смотреть")).toBeInTheDocument();

    const matrixLink = await screen.findByRole("link", { name: /Матрица/ });
    expect(matrixLink).toHaveAttribute("target", "_blank");
    expect(matrixLink).toHaveAttribute("href", expect.stringMatching(/\/watch\/301\/?$/));
    expect(screen.getByText("Буду смотреть")).toBeInTheDocument();
  });

  it("shows IMDb rating on the watch page when it is available", async () => {
    window.history.replaceState(
      null,
      "",
      buildAppUrl({
        ...createHomeSnapshot(),
        view: "watch",
        filmId: 326
      })
    );

    const fetchMock = createFetchMock((url) => {
      if (url.endsWith("/api/kp/films/326")) {
        return filmResponse({
          kinopoiskId: 326,
          title: "Побег из Шоушенка",
          year: "1994",
          posterUrl: "https://example.test/shawshank.jpg",
          rating: "9.1",
          imdbRating: "9.3",
          description: "История надежды."
        });
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText(/IMDb 9\.3/)).toBeInTheDocument();
    expect(screen.getByText(/КП 9\.1/)).toBeInTheDocument();
  });

  it("exposes watch deep-link hrefs on film cards", async () => {
    const fetchMock = createFetchMock((url) => {
      if (url.includes("/api/kp/top")) {
        return (
          mockTopCatalog(url, {
            feedFilms: [
              {
                kinopoiskId: 301,
                title: "Матрица",
                year: "1999",
                posterUrl: "https://example.test/matrix.jpg"
              }
            ]
          }) ?? catalogResponse([])
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const link = await screen.findByRole("link", { name: /Матрица/ });
    expect(link).toHaveAttribute("href", expect.stringMatching(/\/watch\/301\/?$/));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("keeps serial catalog films as new-tab watch links", async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock((url) => {
      if (url.includes("/api/kp/catalog/recent") || url.includes("TV_SERIES")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 5,
              title: "Сериал дня",
              year: "2025",
              posterUrl: "https://example.test/serial.jpg"
            }
          ],
          1,
          1
        );
      }

      if (url.includes("/api/kp/top")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 5,
              title: "Сериал дня",
              year: "2025",
              posterUrl: "https://example.test/serial.jpg"
            }
          ],
          1,
          1
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Сериалы" }));
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/\/serials\/?$/);
    });

    const link = await screen.findByRole("link", { name: /Сериал дня/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("href", expect.stringMatching(/\/watch\/5\/?$/));
  });

  it("opens a film from a cold watch deep link", async () => {
    window.history.replaceState(
      null,
      "",
      buildAppUrl({
        ...createHomeSnapshot(),
        view: "watch",
        filmId: 301
      })
    );

    vi.stubGlobal(
      "fetch",
      createFetchMock((url) => {
        if (url.endsWith("/api/kp/films/301")) {
          return filmResponse({
            kinopoiskId: 301,
            title: "Матрица",
            year: "1999",
            posterUrl: "https://example.test/matrix.jpg",
            description: "Следуй за белым кроликом."
          });
        }

        return undefined;
      })
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Матрица" })).toBeInTheDocument();
    expect(window.location.pathname).toMatch(/\/watch\/301$/);
  });

  it("updates the URL when opening serials and search", async () => {
    const user = userEvent.setup();
    const fetchMock = createFetchMock((url) => {
      if (url.includes("/api/kp/search")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 99,
              title: "Поисковый фильм",
              year: "2024",
              posterUrl: "https://example.test/search.jpg"
            }
          ],
          1,
          1
        );
      }

      if (url.includes("/api/kp/catalog/recent") || url.includes("/api/kp/top")) {
        return catalogResponse(
          [
            {
              kinopoiskId: 5,
              title: "Сериал дня",
              year: "2025",
              posterUrl: "https://example.test/serial.jpg"
            }
          ],
          1,
          1
        );
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Сериалы" }));
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/\/serials\/?$/);
    });

    await user.click(screen.getByRole("button", { name: "Открыть поиск" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск фильма" }), "тест");
    await user.click(screen.getByRole("button", { name: "Найти" }));

    expect(await screen.findByText("Поисковый фильм")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toMatch(/\/search\/?$/);
      expect(window.location.search).toContain("q=");
    });
  });
});
