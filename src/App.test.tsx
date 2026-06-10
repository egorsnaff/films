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

    if (url.includes("/api/kp/catalog/recent")) {
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

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", createFetchMock(() => undefined));
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders top menu and keeps search collapsed until the icon is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    const header = screen.getByRole("banner", { name: "Навигация" });

    expect(screen.getByRole("button", { name: "Главная" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Фильмы" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сериалы" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Подборки" })).toBeInTheDocument();
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
        if (url.includes("/api/kp/catalog/recent")) {
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
    expect(screen.getByText("Новинки для вечера")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить ещё" })).toBeInTheDocument();
  });

  it("hides premieres without posters on the home page", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock((url) => {
        if (url.includes("/api/kp/catalog/recent")) {
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

  it("loads the next catalog page when the load-more button is clicked", async () => {
    const user = userEvent.setup();
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

      if (url.includes("/api/kp/catalog/recent")) {
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
    await user.click(screen.getByRole("button", { name: "Загрузить ещё" }));
    expect(await screen.findByText("Вторая страница")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true);
  });

  it("opens the collections page from the menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Подборки" }));

    expect(await screen.findByText("Подборки фильмов")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /250 лучших фильмов/i })).toBeInTheDocument();
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

      if (url.includes("/api/kp/catalog/recent")) {
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
    expect(screen.queryByText("Новинки для вечера")).not.toBeInTheDocument();
  });
});
