import { ApiError, apiFetch, readError } from "./api";

export type BmcModel = {
  code: string;
  rated_capacity_liters: number;
  shape: string;
  description: string;
};

export type TankVolumeFormula = {
  tank_id: string;
  tank_name: string;
  model_code: string;
  rated_capacity_liters: number;
  shape: string;
  inner_length_cm: number;
  inner_width_cm: number;
  inner_height_cm: number;
  empty_distance_cm: number;
  expression: string;
};

export type LatestReading = {
  volume_distance: number | null;
  volume_liters: number;
  temperature_celsius: number;
};

export type AssignedUser = {
  username: string;
  first_name: string;
  last_name: string;
  role: "monitor" | "configure" | "manage";
};

export type TankSummary = {
  tank_id: string;
  tank_name: string;
  created_by: string | null;
  formula: TankVolumeFormula;
  latest_reading: LatestReading | null;
};

export type TankDetail = TankSummary & {
  assigned_users: AssignedUser[] | null;
};

export type TankHistoryPoint = {
  recorded_at: string;
  temperature_celsius: number;
  volume_liters: number;
};

export type TankHistory = {
  tank_id: string;
  tank_name: string;
  from: string;
  to: string;
  page: number;
  page_size: number;
  total: number;
  readings: TankHistoryPoint[];
};

export type FormulaInput = {
  tank_name: string;
  model_code: string;
  inner_length_cm: number;
  inner_width_cm: number;
  inner_height_cm: number;
  empty_distance_cm: number;
};

export type Page<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new ApiError(await readError(response, fallback));
  }
  return response.json() as Promise<T>;
}

export async function fetchModels(): Promise<BmcModel[]> {
  const first = await readJson<Page<BmcModel>>(
    await apiFetch("/api/v1/bmc-models?page=1&page_size=100"),
    "Could not load cooler models",
  );
  if (first.total <= first.items.length) return first.items;
  // Fetch remaining pages if catalog exceeds 100
  const remaining: BmcModel[] = [];
  let page = 2;
  while (remaining.length + first.items.length < first.total) {
    const more = await readJson<Page<BmcModel>>(
      await apiFetch(`/api/v1/bmc-models?page=${page}&page_size=100`),
      "Could not load cooler models",
    );
    remaining.push(...more.items);
    page += 1;
    if (more.items.length === 0) break;
  }
  return [...first.items, ...remaining];
}

export async function fetchTanks(
  search = "",
  page = 1,
  page_size = 20,
): Promise<Page<TankSummary>> {
  const params = new URLSearchParams({ page: String(page), page_size: String(page_size) });
  if (search.trim()) params.set("search", search.trim());
  return readJson(
    await apiFetch(`/api/v1/tanks?${params.toString()}`),
    "Could not load tanks",
  );
}

export async function fetchTank(tankId: string): Promise<TankDetail> {
  return readJson(
    await apiFetch(`/api/v1/tanks/${encodeURIComponent(tankId)}`),
    "Could not load tank",
  );
}

export async function fetchFormula(tankId: string): Promise<TankVolumeFormula> {
  return readJson(
    await apiFetch(`/api/v1/tanks/${encodeURIComponent(tankId)}/volume-formula`),
    "Could not load the tank formula",
  );
}

export async function saveFormula(tankId: string, input: FormulaInput): Promise<TankVolumeFormula> {
  return readJson(
    await apiFetch(`/api/v1/tanks/${encodeURIComponent(tankId)}/volume-formula`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
    "Could not save the tank",
  );
}

export async function deleteTank(tankId: string): Promise<void> {
  const response = await apiFetch(`/api/v1/tanks/${encodeURIComponent(tankId)}`, {
    method: "DELETE",
  });
  if (response.status === 204) {
    return;
  }
  throw new ApiError(await readError(response, "Could not delete the tank"));
}

export type AssignmentInput = { username: string; role: "monitor" | "configure" | "manage" };

export async function replaceAssignments(
  tankId: string,
  users: AssignmentInput[],
): Promise<AssignedUser[]> {
  const resp = await readJson<{ users: AssignedUser[] }>(
    await apiFetch(`/api/v1/tanks/${encodeURIComponent(tankId)}/assignments`, {
      method: "PUT",
      body: JSON.stringify({ users }),
    }),
    "Could not save assignments",
  );
  return resp.users;
}

/** Fetch all readings for a time window, accumulating pages up to 100 each. */
export async function fetchReadings(
  tankId: string,
  range?: { from: string; to: string },
): Promise<TankHistory> {
  async function fetchPage(page: number): Promise<TankHistory> {
    const params = new URLSearchParams({ page: String(page), page_size: "100" });
    if (range) {
      params.set("from", range.from);
      params.set("to", range.to);
    }
    return readJson(
      await apiFetch(
        `/api/v1/tanks/${encodeURIComponent(tankId)}/readings?${params.toString()}`,
      ),
      "Could not load readings",
    );
  }

  const first = await fetchPage(1);
  if (first.total <= first.readings.length) return first;

  // Accumulate remaining pages
  const allReadings = [...first.readings];
  let page = 2;
  while (allReadings.length < first.total) {
    const more = await fetchPage(page);
    allReadings.push(...more.readings);
    page += 1;
    if (more.readings.length === 0) break;
  }
  return { ...first, readings: allReadings };
}
