import { describe, expect, it } from "vitest";
import { canOpenAnotherStore, canUseChekelin, isPlanActive, planLabel } from "@/lib/plan";
import { canAccessStore, canManageStore, storeNamesForTags, type CurrentBusiness } from "@/lib/stores";
import { isInviteToken } from "@/lib/invitations";

describe("plan", () => {
  it("labels known plans and passes unknown ones through", () => {
    expect(planLabel("plus")).toBe("cheKe Plus");
    expect(planLabel("trial")).toBe("Prueba");
    expect(planLabel("enterprise")).toBe("enterprise");
  });

  it("treats lapsed plans as inactive", () => {
    for (const p of ["lapsed", "expired", "cancelled", "inactive"]) expect(isPlanActive(p)).toBe(false);
    for (const p of ["trial", "cheke", "plus", "pro"]) expect(isPlanActive(p)).toBe(true);
  });

  // Until plans are priced (issue #9) nothing is limited. When #9 lands,
  // update these on purpose.
  it("does not limit Tiendas or chekelin yet", () => {
    expect(canOpenAnotherStore("cheke", 50)).toBe(true);
    expect(canUseChekelin("cheke")).toBe(true);
  });
});

const A = { id: "A", name: "Centro", archived: false };
const B = { id: "B", name: "Mall", archived: false };
const X = { id: "X", name: "Vieja", archived: true };

function biz(role: CurrentBusiness["role"], mine: string[], selected: string = "all"): CurrentBusiness {
  const all = [A, B, X];
  const open = all.filter((s) => !s.archived);
  const stores = role === "owner" ? open : open.filter((s) => mine.includes(s.id));
  return {
    id: "biz",
    name: "Luna",
    plan: "trial",
    role,
    userId: "u",
    allStores: all,
    stores,
    archivedStores: role === "owner" ? [X] : [],
    multiStore: stores.length >= 2,
    selected,
    selectedStore: stores.find((s) => s.id === selected) ?? null,
    scopeStoreIds: stores.map((s) => s.id),
  };
}

describe("store permissions", () => {
  it("Dueños manage and open every Tienda, archived included", () => {
    const owner = biz("owner", []);
    expect(["A", "B", "X"].every((id) => canManageStore(owner, id))).toBe(true);
    expect(canAccessStore(owner, "X")).toBe(true);
    expect(canManageStore(owner, "other-business")).toBe(false);
  });

  it("Gerentes manage only their own open Tiendas", () => {
    const manager = biz("manager", ["A"]);
    expect(canManageStore(manager, "A")).toBe(true);
    expect(canManageStore(manager, "B")).toBe(false);
    expect(canManageStore(manager, "X")).toBe(false);
  });

  it("Agentes manage nothing but open their Tiendas", () => {
    const agent = biz("agent", ["A", "B"]);
    expect(canManageStore(agent, "A")).toBe(false);
    expect(canAccessStore(agent, "B")).toBe(true);
    expect(canAccessStore(agent, "X")).toBe(false);
  });

  it("tags stores only in Todas las tiendas with 2+ Tiendas", () => {
    expect(storeNamesForTags(biz("owner", []))).toEqual({ A: "Centro", B: "Mall" });
    expect(storeNamesForTags(biz("owner", [], "A"))).toBeNull();
    expect(storeNamesForTags(biz("agent", ["A"]))).toBeNull();
  });
});

describe("isInviteToken", () => {
  it("accepts only 64 lowercase hex characters", () => {
    expect(isInviteToken("a".repeat(64))).toBe(true);
    expect(isInviteToken("A".repeat(64))).toBe(false);
    expect(isInviteToken("a".repeat(63))).toBe(false);
    expect(isInviteToken(undefined)).toBe(false);
    expect(isInviteToken("../" + "a".repeat(61))).toBe(false);
  });
});
