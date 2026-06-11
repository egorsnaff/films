import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { WatchAwardChips, WatchAwardsPanel } from "./WatchAwards";
import type { FilmAwardsPayload } from "../lib/kinopoisk";

const sampleAwards: FilmAwardsPayload = {
  total: 3,
  summary: [
    { name: "Оскар", wins: 2, nominations: 0 },
    { name: "Сатурн", wins: 1, nominations: 0 }
  ],
  groups: [
    {
      name: "Оскар",
      year: 2004,
      wins: 2,
      nominations: 0,
      items: [
        { nominationName: "Лучший фильм", win: true, persons: ["Питер Джексон"] },
        { nominationName: "Лучший режиссер", win: true, persons: [] }
      ]
    },
    {
      name: "Сатурн",
      year: 2004,
      wins: 1,
      nominations: 0,
      items: [{ nominationName: "Лучший фэнтези-фильм", win: true, persons: [] }]
    }
  ]
};

describe("WatchAwards", () => {
  it("renders summary chips", () => {
    render(<WatchAwardChips awards={sampleAwards} />);

    expect(screen.getByRole("button", { name: /Оскар ×2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Сатурн ×1/ })).toBeInTheDocument();
  });

  it("keeps award groups collapsed until toggled", async () => {
    const user = userEvent.setup();
    render(<WatchAwardsPanel awards={sampleAwards} />);

    expect(screen.getByRole("button", { name: /Оскар 2004/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Сатурн 2004/ })).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: /Оскар 2004/ }));

    expect(screen.getByRole("button", { name: /Оскар 2004/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Сатурн 2004/ })).toHaveAttribute("aria-expanded", "false");

    await user.click(screen.getByRole("button", { name: /Сатурн 2004/ }));

    expect(screen.getByRole("button", { name: /Сатурн 2004/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the requested ceremony group when controlled", () => {
    render(
      <WatchAwardsPanel
        awards={sampleAwards}
        openGroupKey="Сатурн:2004"
        onOpenGroupKeyChange={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: /Оскар 2004/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Сатурн 2004/ })).toHaveAttribute("aria-expanded", "true");
  });
});
