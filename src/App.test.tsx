import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] })
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders top menu and keeps search collapsed until the icon is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("link", { name: "Главная" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Фильмы" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Сериалы" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Подборки" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Профиль" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Поиск фильма" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Найди фильм/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/найдено/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Открыть поиск" }));

    expect(screen.getByRole("searchbox", { name: "Поиск фильма" })).toBeInTheDocument();
  });

  it("renders a default premieres collection on the home page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
          ]
        })
      })
    );

    render(<App />);

    expect(await screen.findByText("Премьера недели")).toBeInTheDocument();
    expect(screen.getByText("Новинки для вечера")).toBeInTheDocument();
  });

  it("clears stale film details when a later detail request fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: []
        })
      })
      .mockResolvedValueOnce({
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
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          kinopoiskId: 1,
          nameRu: "Первый подробно",
          year: 2001,
          description: "Старые детали"
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({})
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Открыть поиск" }));
    await user.type(screen.getByRole("searchbox", { name: "Поиск фильма" }), "первый");
    await user.click(screen.getByRole("button", { name: "Найти" }));
    await user.click(await screen.findByRole("button", { name: /Первый/ }));
    expect(await screen.findByText("Первый подробно")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Вернуться на главную" }));
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
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
          ]
        })
      })
      .mockResolvedValueOnce({
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
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Матрица/ }));

    expect(await screen.findByRole("heading", { name: "Матрица" })).toBeInTheDocument();
    expect(screen.getByText("Страница просмотра")).toBeInTheDocument();
    expect(screen.getByLabelText("Плееры")).toBeInTheDocument();
    expect(screen.queryByText("Новинки для вечера")).not.toBeInTheDocument();
  });
});
