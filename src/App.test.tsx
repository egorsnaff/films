import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

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
    window.IntersectionObserver =
      NoopIntersectionObserver as unknown as typeof IntersectionObserver;
    vi.stubGlobal("fetch", createFetchMock(() => undefined));
  });

  afterEach(() => {
    window.localStorage.clear();
    window.IntersectionObserver = originalIntersectionObserver;
    vi.restoreAllMocks();
  });

  it("renders top menu and keeps search collapsed until the icon is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    const header = screen.getByRole("banner", { name: "Навигация" });

    expect(screen.getByRole("button", { name: "Главная" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Фильмы" })).not.toBeInTheDocument();
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
      createFetchMock((url) => {
        if (url.includes("/api/kp/top")) {
          return catalogResponse(
            [
              {
                kinopoiskId: 77,
                title: "Премьера недели",
                year: "2026",
                posterUrl: "https://example.test/premiere.jpg",
                rating: "7.7"
              }
            ],
            1,
            3
          );
        }

        return undefined;
      })
    );

    render(<App />);

    expect(await screen.findByText("Премьера недели")).toBeInTheDocument();
    expect(screen.queryByText("Популярное сейчас")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить ещё" })).toBeInTheDocument();
  });

  it("hides premieres without posters on the home page", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock((url) => {
        if (url.includes("/api/kp/top")) {
          return catalogResponse([
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
          ]);
        }

        return undefined;
      })
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
        return catalogResponse(
          [
            {
              kinopoiskId: 77,
              title: "Премьера недели",
              year: "2026",
              posterUrl: "https://example.test/premiere.jpg"
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

    await user.click(screen.getByRole("button", { name: "Каталог" }));
    await user.click(await screen.findByRole("button", { name: "драма" }));

    expect(await screen.findByText("Фильтрованная драма")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Главная" }));

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


  it("clears stale film details when a later detail request fails", async () => {
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

      if (url.endsWith("/api/kp/films/1")) {
        return filmResponse({
          kinopoiskId: 1,
          title: "Первый подробно",
          year: "2001",
          description: "Старые детали"
        });
      }

      if (url.endsWith("/api/kp/films/2")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Kinopoisk API failed with status 500" })
        };
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Открыть поиск" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск фильма" }), "первый");
    await user.click(screen.getByRole("button", { name: "Найти" }));
    await user.click(await screen.findByRole("button", { name: /Первый/ }));
    expect(await screen.findByText("Первый подробно")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "К результатам" }));
    await user.click(screen.getByRole("button", { name: /Второй/ }));

    await waitFor(() =>
      expect(screen.queryByText("Первый подробно")).not.toBeInTheDocument()
    );
    expect(
      await screen.findByText("Kinopoisk API failed with status 500")
    ).toBeInTheDocument();
  });

  it("opens players on a dedicated watch page", async () => {
    const user = userEvent.setup();
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

      if (url.includes("/api/kp/top")) {
        return catalogResponse([
          {
            kinopoiskId: 301,
            title: "Матрица",
            year: "1999",
            posterUrl: "https://example.test/matrix.jpg",
            rating: "8.5"
          }
        ]);
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Матрица/ }));

    expect(await screen.findByRole("heading", { name: "Матрица" })).toBeInTheDocument();
    expect(screen.getByText("Фильм о выборе реальности.")).toBeInTheDocument();
    expect(screen.getByLabelText("Плееры")).toBeInTheDocument();
    expect(screen.queryByText("Популярное сейчас")).not.toBeInTheDocument();
  });

  it("returns to the home catalog from watch page back navigation", async () => {
    const user = userEvent.setup();
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

      if (url.includes("/api/kp/top")) {
        return catalogResponse([
          {
            kinopoiskId: 301,
            title: "Матрица",
            year: "1999",
            posterUrl: "https://example.test/matrix.jpg",
            rating: "8.5"
          }
        ]);
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Матрица/ }));
    expect(await screen.findByRole("heading", { name: "Матрица" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "На главную" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Матрица/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Матрица" })).not.toBeInTheDocument();
  });

  it("returns to the profile shelf from watch page back navigation", async () => {
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

      if (url.includes("/api/kp/similars")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ films: [] })
        });
      }

      if (url.endsWith("/api/kp/films/301")) {
        return Promise.resolve(
          filmResponse({
            kinopoiskId: 301,
            title: "Матрица",
            year: "1999",
            posterUrl: "https://example.test/matrix.jpg",
            rating: "8.5",
            description: "Фильм о выборе реальности."
          })
        );
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

    const matrixTitle = await screen.findByText("Матрица");
    await user.click(matrixTitle.closest("button")!);
    expect(await screen.findByRole("heading", { name: "Матрица" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "В кабинет" }));

    await waitFor(() => {
      expect(screen.getByText("Буду смотреть")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Матрица" })).not.toBeInTheDocument();
  });

  it("shows IMDb rating on the watch page when it is available", async () => {
    const user = userEvent.setup();
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

      if (url.includes("/api/kp/top")) {
        return catalogResponse([
          {
            kinopoiskId: 326,
            title: "Побег из Шоушенка",
            year: "1994",
            posterUrl: "https://example.test/shawshank.jpg",
            rating: "9.1"
          }
        ]);
      }

      return undefined;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Побег из Шоушенка/ }));

    expect(await screen.findByText(/IMDb 9\.3/)).toBeInTheDocument();
    expect(screen.getByText(/КП 9\.1/)).toBeInTheDocument();
  });
});
