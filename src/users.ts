import { ApiError, apiFetch, readError } from "./api";
import type { Page } from "./tanks";

export type User = {
  username: string;
  first_name: string;
  last_name: string;
  mobile_number: string;
};

export type CreateUserInput = {
  username: string;
  first_name: string;
  last_name: string;
  mobile_number: string;
  password: string;
};

export type PatchUserInput = {
  first_name?: string;
  last_name?: string;
  mobile_number?: string;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new ApiError(await readError(response, fallback));
  }
  return response.json() as Promise<T>;
}

export async function fetchUsers(
  search = "",
  page = 1,
  page_size = 20,
): Promise<Page<User>> {
  const params = new URLSearchParams({ page: String(page), page_size: String(page_size) });
  if (search.trim()) params.set("search", search.trim());
  return readJson(
    await apiFetch(`/api/v1/users?${params.toString()}`),
    "Could not load users",
  );
}

export async function fetchUser(username: string): Promise<User> {
  return readJson(
    await apiFetch(`/api/v1/users/${encodeURIComponent(username)}`),
    "Could not load user",
  );
}

export async function createUser(input: CreateUserInput): Promise<User> {
  return readJson(
    await apiFetch("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    "Could not create user",
  );
}

export async function patchUser(username: string, input: PatchUserInput): Promise<User> {
  return readJson(
    await apiFetch(`/api/v1/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
    "Could not update user",
  );
}

export async function setUserPassword(username: string, password: string): Promise<void> {
  const response = await apiFetch(`/api/v1/users/${encodeURIComponent(username)}/password`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
  if (response.status === 204) return;
  throw new ApiError(await readError(response, "Could not set password"));
}

export async function deleteUser(username: string): Promise<void> {
  const response = await apiFetch(`/api/v1/users/${encodeURIComponent(username)}`, {
    method: "DELETE",
  });
  if (response.status === 204) return;
  throw new ApiError(await readError(response, "Could not delete user"));
}
