import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { KinoboxPlayerPanel } from "./KinoboxPlayerPanel";

describe("KinoboxPlayerPanel", () => {
  it("renders Kinobox source tabs and switches the active iframe", async () => {
    const user = userEvent.setup();
    const resolvePlayers = vi.fn().mockResolvedValue([
      {
        id: "collaps-0",
        type: "collaps",
        iframeUrl: "https://api.atomics.ws/embed/kp/301",
        translation: "Дубляж"
      },
      {
        id: "kodik-1",
        type: "kodik",
        iframeUrl: "https://kodik.example.test/embed",
        quality: "1080p"
      }
    ]);

    render(
      <KinoboxPlayerPanel
        resolvePlayers={resolvePlayers}
        embedFallback="https://kinohost.web.app/embed/301?domain=nayteruz.github.io"
      />
    );

    expect(await screen.findByRole("button", { name: "collaps · Дубляж" })).toBeInTheDocument();
    expect(screen.getByTitle("collaps · Дубляж")).toHaveAttribute(
      "src",
      "https://api.atomics.ws/embed/kp/301"
    );

    await user.click(screen.getByRole("button", { name: "kodik · 1080p" }));

    expect(screen.getByTitle("kodik · 1080p")).toHaveAttribute(
      "src",
      "https://kodik.example.test/embed"
    );
  });

  it("falls back to the embed page when Kinobox API fails", async () => {
    const resolvePlayers = vi.fn().mockRejectedValue(new Error("Kinobox API down"));

    render(
      <KinoboxPlayerPanel
        resolvePlayers={resolvePlayers}
        embedFallback="https://kinohost.web.app/embed/301?domain=nayteruz.github.io"
      />
    );

    expect(await screen.findByTitle("Kinobox")).toHaveAttribute(
      "src",
      "https://kinohost.web.app/embed/301?domain=nayteruz.github.io"
    );
    expect(screen.getByText("Открываем встроенную страницу Kinobox.")).toBeInTheDocument();
  });
});
