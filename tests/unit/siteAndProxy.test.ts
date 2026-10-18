import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The signed-in person the fake Supabase reports (null = signed out).
let currentUser: { id: string } | null = null;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
}));

// site.ts reads NEXT_PUBLIC_APP_URL when it loads, so each case reloads it.
async function load(appUrl: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  const site = await import("@/lib/site");
  const { proxy } = await import("@/proxy");
  return { site, proxy };
}

function request(url: string) {
  return new NextRequest(url, { headers: { host: new URL(url).host } });
}

beforeEach(() => {
  currentUser = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("site.ts", () => {
  it("serves everything everywhere until the app URL is set", async () => {
    const { site } = await load("");
    expect(site.isSiteHost("cheke.io")).toBe(false);
    expect(site.appHref("/login")).toBe("/login");
  });

  it("recognizes cheke.io hosts once the split is on", async () => {
    const { site } = await load("https://ventas.cheke.app/");
    expect(site.APP_URL).toBe("https://ventas.cheke.app");
    expect(site.isSiteHost("cheke.io")).toBe(true);
    expect(site.isSiteHost("WWW.CHEKE.IO:443")).toBe(true);
    expect(site.isSiteHost("ventas.cheke.app")).toBe(false);
    expect(site.isSiteHost(null)).toBe(false);
    expect(site.appHref("/demo")).toBe("https://ventas.cheke.app/demo");
  });
});

describe("proxy", () => {
  it("cheke.io serves its own pages and sends the rest to the app", async () => {
    const { proxy } = await load("https://ventas.cheke.app");
    const legal = await proxy(request("https://cheke.io/privacidad"));
    expect(legal.headers.get("location")).toBeNull();
    const app = await proxy(request("https://cheke.io/chat?x=1"));
    expect(app.status).toBe(308);
    expect(app.headers.get("location")).toBe("https://ventas.cheke.app/chat?x=1");
  });

  it("sends signed-out people to /login, except on public pages", async () => {
    const { proxy } = await load("");
    const res = await proxy(request("https://ventas.cheke.app/chat?c=1"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(new URL(res.headers.get("location")!).search).toBe("");
    for (const path of ["/", "/login", "/demo", "/terminos", "/privacidad", "/eliminar-datos"]) {
      expect((await proxy(request(`https://ventas.cheke.app${path}`))).headers.get("location")).toBeNull();
    }
  });

  it("remembers a valid invitation link while signed out, and only a valid one", async () => {
    const { proxy } = await load("");
    const token = "a".repeat(64);
    const res = await proxy(request(`https://ventas.cheke.app/invitacion/${token}`));
    expect(res.cookies.get("cheke_invite")?.value).toBe(token);
    expect(res.cookies.get("cheke_invite")?.httpOnly).toBe(true);
    const bad = await proxy(request("https://ventas.cheke.app/invitacion/not-a-token"));
    expect(bad.cookies.get("cheke_invite")).toBeUndefined();
  });

  it("sends signed-in people from /login to Chat", async () => {
    currentUser = { id: "u1" };
    const { proxy } = await load("");
    const res = await proxy(request("https://ventas.cheke.app/login"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/chat");
    expect((await proxy(request("https://ventas.cheke.app/chat"))).headers.get("location")).toBeNull();
  });

  it("on the app domain, / opens the app (or login)", async () => {
    const { proxy } = await load("https://ventas.cheke.app");
    expect(new URL((await proxy(request("https://ventas.cheke.app/"))).headers.get("location")!).pathname).toBe("/login");
    currentUser = { id: "u1" };
    expect(new URL((await proxy(request("https://ventas.cheke.app/"))).headers.get("location")!).pathname).toBe("/chat");
  });
});
