import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationStage } from "@/lib/types";
import type { OrderItem } from "@/lib/payments";

// Server-only. The order record behind a payment request ("Cobrar"), shared
// by a person in Chat (signed-in client, RLS) and chekelin when it closes an
// order (service-role client). Called only after the payment message went
// out, so a failed send never leaves a phantom charge.

export type RecordedOrder = {
  id: string;
  total_hnl: number;
  payment_link: string | null;
  created_at: string;
};

export async function recordPaymentRequest(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    businessId: string;
    contactId: string;
    stage: string | null;
    items: OrderItem[];
    totalHnl: number;
    link?: string | null;
    // 'chekelin' when chekelin closed the order; 'cheke' for a person's Cobrar.
    source: "cheke" | "chekelin";
    // What chekelin collected (customer name, city, address, delivery…).
    details?: Record<string, unknown>;
  },
): Promise<RecordedOrder | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      business_id: input.businessId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      items: input.items,
      total_hnl: input.totalHnl,
      status: "awaiting_payment",
      payment_link: input.link ?? null,
      source: input.source,
      details: input.details ?? {},
    })
    .select("id, total_hnl, payment_link, created_at")
    .single();
  if (error || !order) {
    console.error("order record error", error);
    return null;
  }

  // A deal that's being charged is at least in negotiation, and its value is
  // what's being charged. Never moves a won/lost deal backwards.
  const earlyStages: ConversationStage[] = ["nuevo", "consulta", "cotizacion"];
  await supabase
    .from("conversations")
    .update({
      value_hnl: input.totalHnl,
      ...(earlyStages.includes((input.stage ?? "nuevo") as ConversationStage) ? { stage: "negociacion" } : {}),
    })
    .eq("id", input.conversationId);

  return { ...order, total_hnl: Number(order.total_hnl) };
}
