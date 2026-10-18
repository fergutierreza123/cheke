import { describe, expect, it } from "vitest";
import { INVITATION_ERRORS, invitationErrorCode, invitationErrorMessage } from "@/lib/invitations";
import { isOwnStorageUrl } from "@/lib/storageUrl";
import { cleanDealValue, isConversationStage } from "@/lib/deals";
import { canWriteToStore, type CurrentBusiness } from "@/lib/stores";

describe("invitation errors (issue #35)", () => {
  it("maps each database message to a fixed code", () => {
    expect(invitationErrorCode("Esta invitación ya se usó. Pide una nueva.")).toBe("used");
    expect(invitationErrorCode("Esta invitación venció. Pide una nueva.")).toBe("expired");
    expect(invitationErrorCode("Esta invitación no existe.")).toBe("missing");
    expect(invitationErrorCode("Esta invitación ya no es válida. Pide una nueva.")).toBe("revoked");
    expect(invitationErrorCode("Ya eres parte de este negocio.")).toBe("member");
    expect(invitationErrorCode("Tu cuenta ya pertenece a otro negocio en cheke.")).toBe("other_business");
    expect(invitationErrorCode("connection reset")).toBe("unknown");
    expect(invitationErrorCode(undefined)).toBe("unknown");
  });

  it("only shows fixed sentences, never text from the URL", () => {
    expect(invitationErrorMessage("used")).toBe(INVITATION_ERRORS.used);
    expect(invitationErrorMessage("Llama al 9999-9999 para reclamar tu premio")).toBeNull();
    expect(invitationErrorMessage("toString")).toBeNull();
    expect(invitationErrorMessage(undefined)).toBeNull();
  });
});

describe("isOwnStorageUrl", () => {
  const base = "https://proj.supabase.co";
  it("accepts our storage and refuses anything else", () => {
    expect(isOwnStorageUrl(`${base}/storage/v1/object/public/product-images/a.jpg`, base)).toBe(true);
    expect(isOwnStorageUrl("https://proj.supabase.co.evil.com/a.jpg", base)).toBe(false);
    expect(isOwnStorageUrl("https://evil.com/a.jpg", base)).toBe(false);
    expect(isOwnStorageUrl("not a url", base)).toBe(false);
    expect(isOwnStorageUrl(`${base}/a.jpg`, undefined)).toBe(false);
  });
});

describe("deals", () => {
  it("knows the chekeo stages", () => {
    expect(isConversationStage("ganado")).toBe(true);
    expect(isConversationStage("won")).toBe(false);
    expect(isConversationStage(3)).toBe(false);
  });

  it("cleans a deal's value", () => {
    expect(cleanDealValue(null)).toEqual({ value: null });
    expect(cleanDealValue(1250.505)).toEqual({ value: 1250.51 });
    expect(cleanDealValue(0)).toEqual({ value: 0 });
    expect(cleanDealValue(-1).error).toBeDefined();
    expect(cleanDealValue(Number.NaN).error).toBeDefined();
    expect(cleanDealValue(1e12).error).toBe("Ese valor es demasiado grande.");
  });
});

describe("canWriteToStore", () => {
  it("allows open Tiendas the person works in, never archived ones", () => {
    const owner = {
      role: "owner",
      stores: [{ id: "A", name: "A", archived: false }],
      archivedStores: [{ id: "X", name: "X", archived: true }],
    } as unknown as CurrentBusiness;
    expect(canWriteToStore(owner, "A")).toBe(true);
    expect(canWriteToStore(owner, "X")).toBe(false);
    expect(canWriteToStore(owner, "Z")).toBe(false);
  });
});
