import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthGateScreen } from "./AuthGateScreen";

describe("AuthGateScreen", () => {
  it("renders login form and submits credentials", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onUsernameChange = vi.fn();
    const onPasswordChange = vi.fn();

    render(
      <AuthGateScreen
        username="viewer"
        password="secret"
        error={null}
        isSubmitting={false}
        onUsernameChange={onUsernameChange}
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByRole("heading", { name: /Войдите, чтобы открыть сеанс/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
