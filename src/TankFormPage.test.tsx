import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveToken } from "./session";
import { TankFormPage } from "./TankFormPage";

const models = [
  {
    code: "bmc-2000-rectangular",
    rated_capacity_liters: 2000,
    shape: "rectangular",
    description: "2000 L rectangular cooler",
  },
];

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

function pagedModels() {
  return { items: models, page: 1, page_size: 100, total: models.length };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderForm(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tanks/new" element={<TankFormPage />} />
          <Route path="/tanks/:tankId/edit" element={<TankFormPage />} />
          <Route path="/tanks/:tankId" element={<p>Opened tank</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TankFormPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    saveToken("jwt-1");
    vi.restoreAllMocks();
  });

  it("creates a tank with the formula fields the API accepts", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return jsonResponse(201, formula);
      }
      return jsonResponse(200, pagedModels());
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm("/tanks/new");

    await user.type(await screen.findByLabelText("Tank id"), "tank-1");
    await user.type(screen.getByLabelText("Tank name"), "North cooler");
    await user.type(screen.getByLabelText("Inner length (cm)"), "200");
    await user.type(screen.getByLabelText("Inner width (cm)"), "100");
    await user.type(screen.getByLabelText("Inner height (cm)"), "90");
    await user.type(screen.getByLabelText("Empty distance (cm)"), "95");
    await user.click(screen.getByRole("button", { name: "Create tank" }));

    await waitFor(() => {
      expect(screen.getByText("Opened tank")).toBeInTheDocument();
    });
    const put = fetchMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(put?.[0]).toBe("/api/v1/tanks/tank-1/volume-formula");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      tank_name: "North cooler",
      model_code: "bmc-2000-rectangular",
      inner_length_cm: 200,
      inner_width_cm: 100,
      inner_height_cm: 90,
      empty_distance_cm: 95,
    });
  });

  it("updates an existing formula", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return jsonResponse(200, { ...formula, tank_name: "North hall" });
      }
      if (String(input).includes("/bmc-models")) {
        return jsonResponse(200, pagedModels());
      }
      return jsonResponse(200, formula);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderForm("/tanks/tank-1/edit");

    const name = await screen.findByLabelText("Tank name");
    expect(name).toHaveValue("North cooler");
    await user.clear(name);
    await user.type(name, "North hall");
    await user.click(screen.getByRole("button", { name: "Save tank" }));

    await waitFor(() => {
      expect(screen.getByText("Opened tank")).toBeInTheDocument();
    });
    const put = fetchMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body)).tank_name).toBe("North hall");
  });
});
