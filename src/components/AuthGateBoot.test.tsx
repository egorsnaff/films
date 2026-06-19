import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthGateBoot } from "./AuthGateBoot";

describe("AuthGateBoot", () => {
  it("renders a minimal loading shell without login form", () => {
    render(<AuthGateBoot />);

    expect(screen.getByLabelText("Загрузка")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Войти" })).not.toBeInTheDocument();
    expect(screen.queryByText("Войдите, чтобы открыть сеанс")).not.toBeInTheDocument();
  });
});
