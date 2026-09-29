import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminPage } from "./AdminPage";

const pending = {
  id: 1,
  email: "new@example.com",
  status: "pending",
  createdAt: "2026-09-29T10:00:00.000Z",
  decidedAt: null
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminPage", () => {
  it("shows no access to regular users without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminPage isAdmin={false} onBack={vi.fn()} />);

    expect(screen.getByText("Нет доступа")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists pending requests and approves one", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/approve")
        ? jsonResponse({ request: { ...pending, status: "approved" } })
        : jsonResponse({ requests: [pending] })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminPage isAdmin onBack={vi.fn()} />);

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/signup-requests?status=pending");

    await user.click(screen.getByRole("button", { name: "Одобрить" }));

    await waitFor(() => expect(screen.queryByText("new@example.com")).not.toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/signup-requests/1/approve");
    expect(init.method).toBe("POST");
  });

  it("loads decided requests on the second tab", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("status=decided")
        ? jsonResponse({
            requests: [{ ...pending, status: "rejected", decidedAt: "2026-09-29T11:00:00.000Z" }]
          })
        : jsonResponse({ requests: [] })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminPage isAdmin onBack={vi.fn()} />);
    expect(await screen.findByText("Новых заявок нет.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Обработанные" }));

    expect(await screen.findByText(/Отклонена/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Одобрить" })).not.toBeInTheDocument();
  });
});
