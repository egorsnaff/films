import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the cinematic command center shell", () => {
    render(<App />);

    expect(screen.getByText("Кинотеатр в браузере")).toBeInTheDocument();
    expect(screen.getByText("поиск, детали и плееры в одном экране")).toBeInTheDocument();
  });

  it("clears stale film details when a later detail request fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
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

    await user.click(screen.getByRole("button", { name: "Найти" }));
    await user.click(await screen.findByRole("button", { name: /Первый/ }));
    expect(await screen.findByText("Первый подробно")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Второй/ }));

    await waitFor(() =>
      expect(screen.queryByText("Первый подробно")).not.toBeInTheDocument()
    );
    expect(
      await screen.findByText("Kinopoisk API request failed with status 500")
    ).toBeInTheDocument();
  });
});
