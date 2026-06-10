import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WatchDetailsPreloader } from "./WatchDetailsPreloader";

describe("WatchDetailsPreloader", () => {
  it("shows the film title and loading status", () => {
    render(
      <WatchDetailsPreloader
        film={{
          kinopoiskId: 361,
          title: "Бойцовский клуб",
          posterUrl: "https://example.test/poster.jpg"
        }}
      />
    );

    expect(screen.getByRole("status", { name: "Загружаем детали фильма" })).toBeInTheDocument();
    expect(screen.getByText("Бойцовский клуб")).toBeInTheDocument();
    expect(screen.getByText("Собираем описание, жанры и плееры")).toBeInTheDocument();
  });
});
