import { describe, expect, it, vi } from "vitest";
import { friendlyError, SOMETHING_WENT_WRONG } from "@/lib/dbErrors";

// What a person sees when Supabase refuses something: never the database's
// English text.
describe("friendlyError", () => {
  it("keeps cheke's own Spanish messages from the database functions", () => {
    expect(friendlyError({ code: "P0001", message: "Tu cuenta ya pertenece a un negocio." })).toBe(
      "Tu cuenta ya pertenece a un negocio.",
    );
  });

  it("explains a permission refusal (Row Level Security) in Spanish", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError({ code: "42501", message: 'new row violates row-level security policy for table "products"' })).toBe(
      "No tienes permiso para hacer este cambio.",
    );
  });

  it("uses the action's own sentence, or a general one, for anything else", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      friendlyError({ code: "23502", message: 'null value in column "name" violates not-null constraint' }, "No se pudo guardar el producto."),
    ).toBe("No se pudo guardar el producto.");
    expect(friendlyError({ message: "fetch failed" })).toBe(SOMETHING_WENT_WRONG);
    expect(friendlyError(null)).toBe(SOMETHING_WENT_WRONG);
  });

  it("logs the original error for debugging", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    friendlyError({ code: "XX000", message: "boom" }, "No se pudo.");
    expect(log).toHaveBeenCalled();
  });
});
