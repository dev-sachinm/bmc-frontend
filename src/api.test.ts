import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, login } from "./api";
import { getToken, saveToken } from "./session";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("login", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("posts username and password and stores the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        access_token: "jwt-1",
        token_type: "bearer",
        expires_in: 43200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await login("asha", "choose-a-long-secret");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "asha",
          password: "choose-a-long-secret",
        }),
      }),
    );
    expect(getToken()).toBe("jwt-1");
  });

  it("rejects with the API detail and stores nothing on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, { detail: "Invalid username or password" }),
      ),
    );

    await expect(login("asha", "wrong-password")).rejects.toThrow(
      "Invalid username or password",
    );
    expect(getToken()).toBeNull();
  });
});

describe("apiFetch", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("clears the token when the API returns 401", async () => {
    saveToken("jwt-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, { detail: "Invalid or expired access token" }),
      ),
    );

    await expect(apiFetch("/api/v1/tanks")).rejects.toThrow(
      "Invalid or expired access token",
    );
    expect(getToken()).toBeNull();
  });
});
