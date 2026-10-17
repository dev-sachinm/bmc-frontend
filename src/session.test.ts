import { beforeEach, describe, expect, it } from "vitest";
import {
  clearToken,
  getToken,
  notifyUnauthorized,
  saveToken,
  subscribeUnauthorized,
} from "./session";

describe("session", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores and reads the access token", () => {
    saveToken("jwt-1");
    expect(getToken()).toBe("jwt-1");
  });

  it("clears the access token", () => {
    saveToken("jwt-1");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("clears the token and notifies listeners on unauthorized", () => {
    saveToken("jwt-1");
    const seen: string[] = [];
    const unsubscribe = subscribeUnauthorized(() => {
      seen.push("unauthorized");
    });

    notifyUnauthorized();

    expect(getToken()).toBeNull();
    expect(seen).toEqual(["unauthorized"]);
    unsubscribe();
  });
});
