import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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
        players={[{ id: "bad", title: "Bad", embedUrl: "ftp://example.test/movie" }]}
      />
    );

    expect(screen.getByText("Плееры пока недоступны")).toBeInTheDocument();
  });
});
