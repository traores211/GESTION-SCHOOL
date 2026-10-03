import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal browser globals: localStorage and a location the session-expired redirect can write to. */
function stubBrowser() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", { location: { pathname: "/billing", href: "/billing" } });
  return store;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("api client", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.resetModules();
    store = stubBrowser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the access token and parses JSON", async () => {
    store.set("schoolerp_token", "tok-1");
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    await expect(api.get("/students")).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer tok-1");
    expect(init.credentials).toBe("include");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    store.set("schoolerp_token", "expired");
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) return json(200, { accessToken: "fresh", user: { id: "u1" } });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer fresh" ? json(200, { n: 1 }) : json(401, { message: "Unauthorized" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    // Two concurrent calls share a single refresh request.
    await expect(Promise.all([api.get("/a"), api.get("/b")])).resolves.toEqual([{ n: 1 }, { n: 1 }]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
    expect(store.get("schoolerp_token")).toBe("fresh");
  });

  it("clears the session and redirects to login when the refresh fails", async () => {
    store.set("schoolerp_token", "expired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { message: "Unauthorized" })));
    const { api } = await import("./api");
    await expect(api.get("/students")).rejects.toMatchObject({ status: 401 });
    expect(store.has("schoolerp_token")).toBe(false);
    expect((window as unknown as { location: { href: string } }).location.href).toBe("/login?expired=1&next=%2Fbilling");
  });

  it("keeps the 401 of public auth routes (wrong password) without refreshing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, { message: "Identifiants invalides" }));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    await expect(api.post("/auth/login", { email: "a", password: "b" })).rejects.toMatchObject({ status: 401, message: "Identifiants invalides" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("turns validation arrays and forbidden errors into readable messages", async () => {
    store.set("schoolerp_token", "tok");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(400, { message: ["amount must be an integer", "dueDate is required"] }))
      .mockResolvedValueOnce(json(403, { message: "Forbidden resource" }));
    vi.stubGlobal("fetch", fetchMock);
    const { api, errorMessage } = await import("./api");
    await expect(api.post("/billing/invoices", {})).rejects.toThrow("amount must be an integer, dueDate is required");
    const err = await api.get("/audit").catch((e) => e);
    expect(errorMessage(err)).toBe("Accès refusé");
    expect(errorMessage(new TypeError("fetch failed"))).toMatch(/joindre le serveur/);
  });

  it("resolves media URLs from local uploads and object storage", async () => {
    const { api } = await import("./api");
    expect(api.mediaUrl(null)).toBeNull();
    expect(api.mediaUrl("https://cdn.example.ci/logo.png")).toBe("https://cdn.example.ci/logo.png");
    expect(api.mediaUrl("/uploads/logo.png")).toMatch(/\/api\/uploads\/logo\.png$/);
  });
});
