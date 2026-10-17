import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveToken } from "./session";
import { UsersPage } from "./UsersPage";

const userAsha = {
  username: "asha",
  first_name: "Asha",
  last_name: "Patil",
  mobile_number: "9876543210",
};

const userRavi = {
  username: "ravi",
  first_name: "Ravi",
  last_name: "Kumar",
  mobile_number: "9000000001",
};

function pagedResponse<T>(items: T[], total?: number) {
  return { items, page: 1, page_size: 20, total: total ?? items.length };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderUsers() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("lists users with name and username", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([userAsha, userRavi]))),
    );
    renderUsers();

    expect(await screen.findByText("Asha Patil")).toBeInTheDocument();
    expect(screen.getByText("asha")).toBeInTheDocument();
    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
  });

  it("shows empty state when no users match", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([], 0))),
    );
    renderUsers();

    expect(await screen.findByText("No users found.")).toBeInTheDocument();
  });

  it("shows pager controls when total exceeds page size", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { items: [userAsha], page: 1, page_size: 20, total: 25 })),
    );
    renderUsers();

    await screen.findByText("Asha Patil");
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("sends search and page params to the API", async () => {
    saveToken("jwt-1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([userAsha])));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderUsers();

    await screen.findByText("Asha Patil");
    await user.type(screen.getByPlaceholderText(/search by name/i), "asha");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const searchCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("search=asha"));
    expect(searchCall).toBeTruthy();
    const params = new URL(String(searchCall![0]), "http://localhost").searchParams;
    expect(params.get("page")).toBe("1");
    expect(params.get("page_size")).toBe("20");
  });
});
