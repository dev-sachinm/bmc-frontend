import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveToken } from "./session";
import { TankDetailPage } from "./TankDetailPage";

/** Build a minimal HS256-shaped JWT whose sub claim is the given username. */
function makeToken(sub: string): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "");
  const payload = btoa(JSON.stringify({ sub })).replace(/=/g, "");
  return `${header}.${payload}.fake-sig`;
}

const formula = {
  tank_id: "tank-1",
  tank_name: "North cooler",
  model_code: "bmc-2000-rectangular",
  rated_capacity_liters: 2000,
  shape: "rectangular",
  inner_length_cm: 200,
  inner_width_cm: 100,
  inner_height_cm: 90,
  empty_distance_cm: 95,
  expression: "liters = height * length * width / 1000",
};

const tankDetail = {
  tank_id: "tank-1",
  tank_name: "North cooler",
  created_by: "asha",
  formula,
  latest_reading: null,
  assigned_users: [
    { username: "ravi", first_name: "Ravi", last_name: "Kumar", role: "monitor" },
  ],
};

const pagedReadings = {
  tank_id: "tank-1",
  tank_name: "North cooler",
  from: "2026-10-17T06:00:00Z",
  to: "2026-10-17T07:00:00Z",
  page: 1,
  page_size: 100,
  total: 2,
  readings: [
    { recorded_at: "2026-10-17T06:10:00Z", temperature_celsius: 4.1, volume_liters: 900 },
    { recorded_at: "2026-10-17T06:40:00Z", temperature_celsius: 4.4, volume_liters: 1100 },
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetch(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "PUT" && url.includes("/assignments"))
      return jsonResponse(200, { users: [] });
    if (url.includes("/readings")) return jsonResponse(200, overrides.readings ?? pagedReadings);
    // GET /api/v1/tanks/tank-1 — the detail endpoint
    return jsonResponse(200, overrides.tank ?? tankDetail);
  });
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tanks/tank-1"]}>
        <Routes>
          <Route path="/tanks/:tankId" element={<TankDetailPage />} />
          <Route path="/" element={<p>Tank list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TankDetailPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads the last hour and draws temperature and volume", async () => {
    saveToken(makeToken("asha"));
    vi.stubGlobal("fetch", makeFetch());
    renderDetail();

    expect(await screen.findByRole("img", { name: /temperature over time/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /volume over time/i })).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();
  });

  it("requests readings with page and page_size", async () => {
    saveToken(makeToken("asha"));
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();

    await screen.findByRole("heading", { name: "North cooler" });
    const readingCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/readings"));
    const params = new URL(String(readingCall?.[0]), "http://localhost").searchParams;
    expect(params.get("page")).toBe("1");
    expect(params.get("page_size")).toBe("100");
  });

  it("requests an explicit window for a longer preset", async () => {
    saveToken(makeToken("asha"));
    const fetchMock = makeFetch({ readings: { ...pagedReadings, readings: [] } });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole("heading", { name: "North cooler" });
    await user.click(screen.getByRole("button", { name: "Last 6 hours" }));

    await waitFor(() => {
      const readingUrl = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .find((url) => url.includes("/readings?") && url.includes("from="));
      const params = new URL(readingUrl!, "http://localhost").searchParams;
      const from = new Date(params.get("from") ?? "").getTime();
      const to = new Date(params.get("to") ?? "").getTime();
      expect(to - from).toBe(6 * 60 * 60 * 1000);
    });
  });

  it("shows created_by label", async () => {
    saveToken(makeToken("ravi"));
    vi.stubGlobal("fetch", makeFetch());
    renderDetail();

    expect(await screen.findByText("Created by asha")).toBeInTheDocument();
  });

  describe("Update and Delete visibility", () => {
    it("shows Update and Delete for the tank creator", async () => {
      saveToken(makeToken("asha")); // asha is created_by
      vi.stubGlobal("fetch", makeFetch());
      renderDetail();

      expect(await screen.findByRole("link", { name: "Update tank" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete tank" })).toBeInTheDocument();
    });

    it("shows Update and Delete for systemadmin", async () => {
      saveToken(makeToken("systemadmin"));
      vi.stubGlobal("fetch", makeFetch());
      renderDetail();

      expect(await screen.findByRole("link", { name: "Update tank" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete tank" })).toBeInTheDocument();
    });

    it("hides Update and Delete for an assigned user who is not the creator", async () => {
      saveToken(makeToken("ravi")); // ravi is assigned but not the creator
      vi.stubGlobal("fetch", makeFetch());
      renderDetail();

      await screen.findByText("Created by asha");
      expect(screen.queryByRole("link", { name: "Update tank" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete tank" })).not.toBeInTheDocument();
    });
  });

  describe("Assignment editor (systemadmin only)", () => {
    it("shows the assignment editor for systemadmin", async () => {
      saveToken(makeToken("systemadmin"));
      vi.stubGlobal("fetch", makeFetch());
      renderDetail();

      expect(await screen.findByRole("heading", { name: "Assigned users" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save assignments" })).toBeInTheDocument();
    });

    it("hides the assignment editor for non-admin users", async () => {
      saveToken(makeToken("asha"));
      vi.stubGlobal("fetch", makeFetch());
      renderDetail();

      await screen.findByText("Created by asha");
      expect(screen.queryByRole("button", { name: "Save assignments" })).not.toBeInTheDocument();
    });

    it("sends the correct payload when saving assignments", async () => {
      saveToken(makeToken("systemadmin"));
      const fetchMock = makeFetch();
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      renderDetail();

      await screen.findByRole("button", { name: "Save assignments" });
      await user.click(screen.getByRole("button", { name: "Save assignments" }));

      await waitFor(() => {
        const putCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/assignments"));
        expect(putCall).toBeTruthy();
        expect(JSON.parse(String(putCall![1]!.body))).toEqual({
          users: [{ username: "ravi", role: "monitor" }],
        });
      });
    });
  });

  it("deletes the tank formula when confirmed by the creator", async () => {
    saveToken(makeToken("asha")); // asha is the creator
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Delete tank" }));
    const confirms = screen.getAllByRole("button", { name: "Delete tank" });
    await user.click(confirms[confirms.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Tank list")).toBeInTheDocument();
    });
    const deleteCall = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE");
    expect(deleteCall?.[0]).toBe("/api/v1/tanks/tank-1");
  });
});
