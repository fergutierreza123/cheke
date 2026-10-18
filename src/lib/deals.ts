import type { ConversationStage } from "@/lib/types";
import { STAGE_ORDER } from "@/lib/format";

// chekeo's stage and value, checked on the server before saving (the
// browser can send anything). Safe to import anywhere.

export function isConversationStage(value: unknown): value is ConversationStage {
  return typeof value === "string" && (STAGE_ORDER as string[]).includes(value);
}

const MAX_DEAL_HNL = 10_000_000;

// A deal's value in Lempiras: null clears it; otherwise a number from 0 up
// to 10 millions, rounded to cents. `error` when it can't be saved.
export function cleanDealValue(value: number | null): { value: number | null; error?: string } {
  if (value === null) return { value: null };
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { value: null, error: "Escribe un valor válido en Lempiras." };
  }
  if (value > MAX_DEAL_HNL) return { value: null, error: "Ese valor es demasiado grande." };
  return { value: Math.round(value * 100) / 100 };
}
