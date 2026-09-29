import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserMenu } from "./UserMenu";

function renderMenu(isAdmin: boolean, onAdmin = vi.fn()) {
  render(
    <UserMenu
      isAuthenticated
      isAdmin={isAdmin}
      onLogin={vi.fn()}
      onProfile={vi.fn()}
      onAdmin={onAdmin}
      onLogout={vi.fn()}
    />
  );
  return { onAdmin };
}

describe("UserMenu", () => {
  it("shows the admin item only to admins", async () => {
    const user = userEvent.setup();
    const { onAdmin } = renderMenu(true);

    await user.click(screen.getByRole("button", { name: "Меню пользователя" }));
    await user.click(screen.getByRole("menuitem", { name: "Админка" }));

    expect(onAdmin).toHaveBeenCalled();
  });

  it("hides the admin item from regular users", async () => {
    const user = userEvent.setup();
    renderMenu(false);

    await user.click(screen.getByRole("button", { name: "Меню пользователя" }));

    expect(screen.queryByRole("menuitem", { name: "Админка" })).not.toBeInTheDocument();
  });
});
