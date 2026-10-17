import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveToken } from "./session";
import { UserFormPage } from "./UserFormPage";

const existingUser = {
  username: "asha",
  first_name: "Asha",
  last_name: "Patil",
  mobile_number: "9876543210",
};

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderCreate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/users/new"]}>
        <Routes>
          <Route path="/users/new" element={<UserFormPage />} />
          <Route path="/users/:username" element={<UserFormPage />} />
          <Route path="/users" element={<p>User list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderEdit(username: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/users/${username}`]}>
        <Routes>
          <Route path="/users/:username" element={<UserFormPage />} />
          <Route path="/users" element={<p>User list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UserFormPage — create", () => {
  beforeEach(() => {
    sessionStorage.clear();
    saveToken("jwt-1");
    vi.restoreAllMocks();
  });

  it("posts the correct body when creating a user", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse(201, existingUser);
      return jsonResponse(200, existingUser);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCreate();

    await user.type(screen.getByLabelText("Username"), "asha");
    await user.type(screen.getByLabelText("First name"), "Asha");
    await user.type(screen.getByLabelText("Last name"), "Patil");
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.type(screen.getByLabelText("Password"), "secret-long-enough");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
      expect(postCall?.[0]).toBe("/api/v1/users");
      const body = JSON.parse(String(postCall![1]!.body));
      expect(body.username).toBe("asha");
      expect(body.first_name).toBe("Asha");
      expect(body.password).toBe("secret-long-enough");
    });
  });
});

describe("UserFormPage — edit", () => {
  beforeEach(() => {
    sessionStorage.clear();
    saveToken("jwt-1");
    vi.restoreAllMocks();
  });

  it("loads existing user data into the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, existingUser)));
    renderEdit("asha");

    const firstName = await screen.findByLabelText("First name");
    expect(firstName).toHaveValue("Asha");
    expect(screen.getByLabelText("Last name")).toHaveValue("Patil");
    expect(screen.getByLabelText("Mobile number")).toHaveValue("9876543210");
  });

  it("sends a PATCH with changed fields", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return jsonResponse(200, { ...existingUser, last_name: "Sharma" });
      return jsonResponse(200, existingUser);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderEdit("asha");

    const lastName = await screen.findByLabelText("Last name");
    await user.clear(lastName);
    await user.type(lastName, "Sharma");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH");
      expect(patchCall?.[0]).toBe("/api/v1/users/asha");
      const body = JSON.parse(String(patchCall![1]!.body));
      expect(body.last_name).toBe("Sharma");
    });
  });

  it("sets password with PUT and shows confirmation", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(null, { status: 204 });
      return jsonResponse(200, existingUser);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderEdit("asha");

    await screen.findByLabelText("First name");
    await user.type(screen.getByLabelText("New password"), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(putCall?.[0]).toBe("/api/v1/users/asha/password");
      expect(JSON.parse(String(putCall![1]!.body)).password).toBe("a-brand-new-password");
    });
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
  });

  it("deletes the user and navigates to user list", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return jsonResponse(200, existingUser);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderEdit("asha");

    await screen.findByRole("button", { name: "Delete user" });
    await user.click(screen.getByRole("button", { name: "Delete user" }));
    const confirms = screen.getAllByRole("button", { name: "Delete user" });
    await user.click(confirms[confirms.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("User list")).toBeInTheDocument();
    });
    const deleteCall = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE");
    expect(deleteCall?.[0]).toBe("/api/v1/users/asha");
  });

  it("hides the delete button for systemadmin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { ...existingUser, username: "systemadmin" }),
      ),
    );
    renderEdit("systemadmin");

    await screen.findByLabelText("First name");
    expect(screen.queryByRole("button", { name: "Delete user" })).not.toBeInTheDocument();
  });
});
