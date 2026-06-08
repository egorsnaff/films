import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = String(input);

        if (url.includes("/api/auth") || url.includes("/api/lists")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ error: "Не авторизован" })
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [], totalPages: 1 })
        });
      })
    );
  });

  afterEach(() => {
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
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = String(input);

        if (url.includes("/api/auth") || url.includes("/api/lists")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ error: "Не авторизован" })
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                kinopoiskId: 77,
                nameRu: "Премьера недели",
                year: 2026,
                posterUrlPreview: "https://example.test/premiere.jpg",
                ratingKinopoisk: 7.7
              }
            ],
            totalPages: 3
          })
        });
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
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = String(input);

        if (url.includes("/api/auth") || url.includes("/api/lists")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ error: "Не авторизован" })
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                kinopoiskId: 11,
                nameRu: "С постером",
                year: 2026,
                posterUrlPreview: "https://example.test/with-poster.jpg"
              },
              {
                kinopoiskId: 12,
                nameRu: "Без постера",
                year: 2026
              },
              {
                kinopoiskId: 13,
                nameRu: "Заглушка постера",
                year: 2026,
                posterUrlPreview:
                  "https://kinopoiskapiunofficial.tech/images/posters/kp/no-poster.png"
              }
            ],
            totalPages: 1
          })
        });
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
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/api/auth") || url.includes("/api/lists")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: "Не авторизован" })
        });
      }

      if (url.includes("page=2")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                kinopoiskId: 88,
                nameRu: "Вторая страница",
                year: 2026,
                posterUrlPreview: "https://example.test/page-2.jpg"
              }
            ],
            totalPages: 3
          })
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              kinopoiskId: 77,
              nameRu: "Первая страница",
              year: 2026,
              posterUrlPreview: "https://example.test/page-1.jpg"
            }
          ],
          totalPages: 3
        })
      });
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
    expect(screen.getByRole("button", { name: /Вечер под плед/i })).toBeInTheDocument();
  });

  it("clears stale film details when a later detail request fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementation((input: RequestInfo) => {
        const url = String(input);

        if (url.includes("/api/auth") || url.includes("/api/lists")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ error: "Не авторизован" })
          });
        }

        if (url.includes("search-by-keyword")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              films: [
                {
                  filmId: 1,
                  nameRu: "Первый",
                  year: "2001",
                  posterUrlPreview: "https://example.test/one.jpg"
                },
                {
                  filmId: 2,
                  nameRu: "Второй",
                  year: "2002",
                  posterUrlPreview: "https://example.test/two.jpg"
                }
              ],
              pagesCount: 1
            })
          });
        }

        if (url.endsWith("/films/1")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              kinopoiskId: 1,
              nameRu: "Первый подробно",
              year: 2001,
              description: "Старые детали"
            })
          });
        }

        if (url.endsWith("/films/2")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({})
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ items: [], totalPages: 1 })
        });
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
      await screen.findByText("Kinopoisk API request failed with status 500")
    ).toBeInTheDocument();
  });

  it("opens players on a dedicated watch page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo) => {
      const url = String(input);

      if (url.includes("/api/auth") || url.includes("/api/lists")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: "Не авторизован" })
        });
      }

      if (url.endsWith("/films/301")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            kinopoiskId: 301,
            nameRu: "Матрица",
            year: 1999,
            posterUrl: "https://example.test/matrix.jpg",
            ratingKinopoisk: 8.5,
            description: "Фильм о выборе реальности."
          })
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [
            {
              kinopoiskId: 301,
              nameRu: "Матрица",
              year: 1999,
              posterUrlPreview: "https://example.test/matrix.jpg",
              ratingKinopoisk: 8.5
            }
          ],
          totalPages: 1
        })
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Матрица/ }));

    expect(await screen.findByRole("heading", { name: "Матрица" })).toBeInTheDocument();
    expect(screen.getByText("Страница просмотра")).toBeInTheDocument();
    expect(screen.getByLabelText("Плееры")).toBeInTheDocument();
    expect(screen.queryByText("Новинки для вечера")).not.toBeInTheDocument();
  });
});
