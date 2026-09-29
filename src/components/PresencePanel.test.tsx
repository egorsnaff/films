import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PresenceEntry } from "../lib/presence";

import { PresencePanel } from "./PresencePanel";

const users: PresenceEntry[] = [
  {
    id: 3,
    username: "kseniya",
    online: true,
    activity: { kind: "watching", kinopoiskId: 111543, title: "Темный рыцарь" }
  },
  { id: 4, username: "leha", online: true, activity: { kind: "searching" } },
  { id: 2, username: "anna", online: false }
];

describe("PresencePanel", () => {
  it("shows what each user is doing with a link to the film being watched", () => {
    render(<PresencePanel users={users} collapsed={false} onToggle={() => undefined} />);

    expect(screen.getByText("kseniya")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Темный рыцарь/ })).toHaveAttribute(
      "href",
      expect.stringContaining("111543")
    );
    expect(screen.getByText("ищет фильм")).toBeInTheDocument();
    expect(screen.getByText("не в сети")).toBeInTheDocument();
  });

  it("collapses to online avatars and toggles on click", async () => {
    const onToggle = vi.fn();
    render(<PresencePanel users={users} collapsed onToggle={onToggle} />);

    expect(screen.queryByText("kseniya")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Показать, кто онлайн" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
