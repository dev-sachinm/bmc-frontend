import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getToken, notifyUnauthorized, saveToken } from "./session";

function pagedTanks() {
  return { items: [], page: 1, page_size: 20, total: 0 };
}

function renderApp(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App auth", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(pagedTanks()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  it("keeps the home page free of a back control", async () => {
    saveToken("jwt-1");
    renderApp("/");
    await screen.findByRole("button", { name: /log out/i });
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("puts a back control on other pages that returns home when there is no history", async () => {
    saveToken("jwt-1");
    const user = userEvent.setup();
    renderApp("/tanks/new");

    await user.click(await screen.findByRole("button", { name: /^back$/i }));

    expect(screen.queryByRole("heading", { name: /new tank/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
  });

  it("sends a visitor with no token to the login screen", () => {
    renderApp("/");
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("clears the token and returns to login on logout", async () => {
    saveToken("jwt-1");
    const user = userEvent.setup();
    renderApp("/");

    await user.click(await screen.findByRole("button", { name: /log out/i }));

    expect(getToken()).toBeNull();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("returns to login when a later request is unauthorized", async () => {
    saveToken("jwt-1");
    renderApp("/");
    await screen.findByRole("button", { name: /log out/i });

    act(() => {
      notifyUnauthorized();
    });

    expect(getToken()).toBeNull();
    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
  });
});
