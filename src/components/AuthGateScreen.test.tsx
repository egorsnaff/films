import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthGateScreen } from "./AuthGateScreen";

function renderScreen(onSubmit = vi.fn((event) => event.preventDefault())) {
  render(
    <AuthGateScreen
      username="viewer"
      password="secret"
      error={null}
      isSubmitting={false}
      onUsernameChange={vi.fn()}
      onPasswordChange={vi.fn()}
      onSubmit={onSubmit}
    />
  );
  return { onSubmit };
}

function jsonResponse(body: unknown, status: number) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

async function fillSignup(password: string, confirm: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Подать заявку" }));
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(screen.getByLabelText("Пароль"), password);
  await user.type(screen.getByLabelText("Повторите пароль"), confirm);
  await user.click(screen.getByRole("button", { name: "Отправить заявку" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthGateScreen", () => {
  it("renders login form and submits credentials", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderScreen();

    expect(screen.getByRole("heading", { name: /Войдите, чтобы открыть сеанс/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Логин или email")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("switches between login and signup", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Подать заявку" }));
    expect(screen.getByRole("heading", { name: "Заявка на доступ" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(screen.getByRole("heading", { name: /Войдите, чтобы открыть сеанс/ })).toBeInTheDocument();
  });

  it("checks that passwords match before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();

    await fillSignup("password123", "password999");

    expect(screen.getByRole("alert")).toHaveTextContent("Пароли не совпадают");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the request and confirms it", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }, 201));
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();

    await fillSignup("password123", "password123");

    expect(await screen.findByRole("status")).toHaveTextContent("Заявка отправлена");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/signup");
    expect(JSON.parse(String(init.body))).toEqual({ email: "new@example.com", password: "password123" });
  });

  it("shows the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Заявка с этим email уже на рассмотрении" }, 409))
    );
    renderScreen();

    await fillSignup("password123", "password123");

    expect(await screen.findByRole("alert")).toHaveTextContent("Заявка с этим email уже на рассмотрении");
  });
});
