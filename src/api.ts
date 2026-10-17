import { getToken, notifyUnauthorized, saveToken } from "./session";

export class ApiError extends Error {}

type ErrorBody = { detail?: unknown };

function formatDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (!Array.isArray(detail)) {
    return null;
  }
  const parts = detail
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "msg" in item) {
        const record = item as { msg?: unknown; loc?: unknown };
        const message = typeof record.msg === "string" ? record.msg : "";
        const loc = Array.isArray(record.loc)
          ? record.loc.filter((part) => part !== "body").join(" ")
          : "";
        return loc && message ? `${loc}: ${message}` : message;
      }
      return "";
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(". ") : null;
}

export async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as ErrorBody;
    return formatDetail(body.detail) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (response.status === 401) {
    throw new ApiError(await readError(response, "Invalid username or password"));
  }
  if (!response.ok) {
    throw new ApiError(await readError(response, "Login failed"));
  }

  const body = (await response.json()) as { access_token: string };
  saveToken(body.access_token);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    const detail = await readError(response, "Invalid or expired access token");
    notifyUnauthorized();
    throw new ApiError(detail);
  }
  return response;
}
