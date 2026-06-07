import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MoviePlayers } from "./MoviePlayers";

describe("MoviePlayers", () => {
  it("renders safe player tabs and switches the active iframe", async () => {
    const user = userEvent.setup();

    render(
      <MoviePlayers
        players={[
          {
            id: "trailer",
            title: "Трейлер",
            embedUrl: "https://www.youtube.com/embed/abc"
          },
          {
            id: "server",
            title: "Сервер",
            embedUrl: "https://video.sibnet.ru/shell.php?videoid=123"
          },
          {
            id: "bad",
            title: "Bad",
            embedUrl: "javascript:alert(1)"
          }
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Трейлер" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("button", { name: "Bad" })).not.toBeInTheDocument();
    expect(screen.getByTitle("Трейлер")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/abc"
    );

    await user.click(screen.getByRole("button", { name: "Сервер" }));

    expect(screen.getByRole("button", { name: "Сервер" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByTitle("Сервер")).toHaveAttribute(
      "src",
      "https://video.sibnet.ru/shell.php?videoid=123"
    );
  });

  it("shows a helpful empty state when no safe players are available", () => {
    render(
      <MoviePlayers
        players={[
          { id: "bad", title: "Bad", embedUrl: "ftp://example.test/movie" },
          { id: "http", title: "HTTP", embedUrl: "http://example.test/embed" }
        ]}
      />
    );

    expect(screen.getByText("Плееры пока недоступны")).toBeInTheDocument();
  });

  it("loads async player iframe when its tab is selected", async () => {
    const user = userEvent.setup();
    let resolvePlayer!: (value: string) => void;
    const resolveEmbedUrl = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvePlayer = resolve;
        })
    );

    render(
      <MoviePlayers
        players={[
          {
            id: "alloha",
            title: "Alloha",
            embedUrl: "https://example.test/alloha"
          },
          {
            id: "coll",
            title: "Coll",
            resolveEmbedUrl
          }
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Coll" }));

    expect(screen.getByText("Загрузка плеера...")).toBeInTheDocument();
    resolvePlayer("https://async.example.test/embed");
    expect(await screen.findByTitle("Coll")).toHaveAttribute(
      "src",
      "https://async.example.test/embed"
    );
  });
});
