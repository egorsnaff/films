import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("keeps each row locked while its own request is in flight", async () => {
    const user = userEvent.setup();
    const first = { ...pending, id: 1, email: "a@example.com" };
    const second = { ...pending, id: 2, email: "b@example.com" };
    const resolvers: Record<string, (response: Response) => void> = {};
    const fetchMock = vi.fn((url: string) =>
      url.endsWith("/approve")
        ? new Promise<Response>((resolve) => {
            resolvers[url] = resolve;
          })
        : Promise.resolve(jsonResponse({ requests: [first, second] }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminPage isAdmin onBack={vi.fn()} />);

    const rowA = within((await screen.findByText("a@example.com")).closest("li")!);
    const rowB = within(screen.getByText("b@example.com").closest("li")!);

    await user.click(rowA.getByRole("button", { name: "Одобрить" }));
    await user.click(rowB.getByRole("button", { name: "Одобрить" }));

    expect(rowA.getByRole("button", { name: "Одобрить" })).toBeDisabled();
    expect(rowA.getByRole("button", { name: "Отклонить" })).toBeDisabled();

    resolvers["/api/admin/signup-requests/1/approve"](
      jsonResponse({ request: { ...first, status: "approved" } })
    );
    await waitFor(() => expect(screen.queryByText("a@example.com")).not.toBeInTheDocument());
    expect(rowB.getByRole("button", { name: "Одобрить" })).toBeDisabled();
    expect(rowB.getByRole("button", { name: "Отклонить" })).toBeDisabled();

    resolvers["/api/admin/signup-requests/2/approve"](
      jsonResponse({ request: { ...second, status: "approved" } })
    );
    await waitFor(() => expect(screen.queryByText("b@example.com")).not.toBeInTheDocument());
  });
});
