"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business";
import { sendChatMessage } from "../chat/actions";
import { formatLempiras } from "@/lib/format";
import type { Product } from "@/lib/types";

export async function saveProduct(formData: FormData): Promise<{ error?: string }> {
  const business = await getCurrentBusiness();
  if (!business) return { error: "No se encontró el negocio." };

  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ponle un nombre al producto." };

  const category = String(formData.get("category") ?? "").trim() || null;
  const price = Math.max(0, Math.round(Number(formData.get("price") ?? 0)) || 0);
  const stock = Math.max(0, Math.round(Number(formData.get("stock") ?? 0)) || 0);
  const visible = formData.get("visible") === "on";

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("products")
      .update({ name, category, price_hnl: price, stock, visible })
      .eq("id", id)
      .eq("business_id", business.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("products").insert({
      business_id: business.id,
      retailer_id: randomUUID(),
      name,
      category,
      price_hnl: price,
      stock,
      visible,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/inventory");
  return {};
}

// "Enviar por chat" — sends the product's name and price as a real chat
// message to an existing conversation. Actual WhatsApp catalog/product
// messages are Phase 6 (needs Meta's Catalog API); this is the demoable
// version that works today over whichever channel the conversation uses.
export async function sendProductToConversation(
  conversationId: string,
  product: Pick<Product, "name" | "price_hnl">,
): Promise<{ error?: string }> {
  const text = `${product.name} — ${formatLempiras(product.price_hnl)}`;
  const result = await sendChatMessage(conversationId, text);
  if (result.error) return { error: result.error };
  if (result.sendError) return { error: result.sendError };
  return {};
}
