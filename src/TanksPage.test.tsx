import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveToken } from "./session";
import { TANKS_POLL_MS, TanksPage } from "./TanksPage";

const formulaBase = {
  tank_id: "tank-1",
  tank_name: "North cooler",
  model_code: "bmc-2000-rectangular",
  rated_capacity_liters: 2000,
  shape: "rectangular",
  inner_length_cm: 200,
  inner_width_cm: 100,
  inner_height_cm: 90,
  empty_distance_cm: 95,
  expression: "liters = clamp(95 - volume_distance, 0, 90) * 200 * 100 / 1000",
};

const northCooler = {
  tank_id: "tank-1",
  tank_name: "North cooler",
  created_by: "asha",
  formula: formulaBase,
  latest_reading: {
    volume_distance: 40,
    volume_liters: 1100,
    temperature_celsius: 4.2,
  },
};

const waitingTank = {
  ...northCooler,
  tank_id: "tank-2",
  tank_name: "South cooler",
  created_by: null,
  latest_reading: null,
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

function renderTanks() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TanksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TanksPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows temperature, volume, and rated capacity", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([northCooler]))),
    );
    renderTanks();

    expect(await screen.findByRole("heading", { name: "North cooler" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open tank-1" })).toHaveAttribute(
      "href",
      "/tanks/tank-1",
    );
    expect(screen.getByText("4.2°C")).toBeInTheDocument();
    expect(screen.getByText("1100 L")).toBeInTheDocument();
    expect(screen.getByText("Capacity 2000 L")).toBeInTheDocument();
  });

  it("shows the creator username on each card", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([northCooler]))),
    );
    renderTanks();

    expect(await screen.findByText("By asha")).toBeInTheDocument();
  });

  it("shows that no reading has arrived", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([waitingTank]))),
    );
    renderTanks();

    expect(await screen.findByRole("heading", { name: "South cooler" })).toBeInTheDocument();
    expect(screen.getByText("No reading yet")).toBeInTheDocument();
  });

  it("opens a tank that has no name", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, pagedResponse([{ ...northCooler, tank_name: "   " }])),
      ),
    );
    renderTanks();

    expect(await screen.findByRole("heading", { name: "tank-1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open tank-1" })).toHaveAttribute(
      "href",
      "/tanks/tank-1",
    );
  });

  it("shows empty state when no tanks match", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([], 0))),
    );
    renderTanks();

    expect(await screen.findByText("No tanks found.")).toBeInTheDocument();
  });

  it("shows pager when there is more than one page", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { items: [northCooler], page: 1, page_size: 20, total: 25 })),
    );
    renderTanks();

    await screen.findByRole("heading", { name: "North cooler" });
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("sends a search query to the API", async () => {
    saveToken("jwt-1");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([northCooler])));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderTanks();

    await screen.findByRole("heading", { name: "North cooler" });
    await user.type(screen.getByPlaceholderText(/search by tank/i), "north");
    await user.click(screen.getByRole("button", { name: "Search" }));

    const tankCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("search=north"),
    );
    expect(tankCall).toBeTruthy();
  });

  it("refetches every 5 seconds with the bearer token", async () => {
    expect(TANKS_POLL_MS).toBe(5000);
    saveToken("jwt-1");
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, pagedResponse([northCooler])));
    vi.stubGlobal("fetch", fetchMock);
    renderTanks();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole("heading", { name: "North cooler" })).toBeInTheDocument();
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    const firstHeaders = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(firstUrl).toContain("/api/v1/tanks");
    expect(firstHeaders.get("Authorization")).toBe("Bearer jwt-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
