import type { SupabaseClient } from "@supabase/supabase-js";
import { proposeTemplates } from "@/lib/ai";
import { canUseChekelin } from "@/lib/plan";
import { recordChekelinUsage } from "@/lib/chekelinAllowance";
import { TEMPLATE_CATEGORY_ORDER } from "@/lib/format";

// "Sugerencias de chekelin" (weekly, from /api/cron/suggestions): for each
// Negocio, the questions the team answered 3+ times in the past week become
// proposed Plantillas, waiting in Plantillas for a Gerente or Dueño to
// approve, edit or dismiss. Nothing becomes a Plantilla by itself.
// Server-only, service-role client.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAIRS = 150;
const MAX_TEXT = 300;
const MIN_TIMES = 3;

export async function runWeeklySuggestions(supabase: SupabaseClient): Promise<{ businesses: number; created: number }> {
  const recheck = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, plan")
    .or(`suggestions_checked_at.is.null,suggestions_checked_at.lt."${recheck}"`)
    .limit(25);

  let created = 0;
  for (const business of businesses ?? []) {
    // Claim first, so two runs never ask twice (and one bad Negocio doesn't
    // block the others).
    const { data: claimed } = await supabase
      .from("businesses")
      .update({ suggestions_checked_at: new Date().toISOString() })
      .eq("id", business.id)
      .or(`suggestions_checked_at.is.null,suggestions_checked_at.lt."${recheck}"`)
      .select("id");
    if (!claimed?.length || !canUseChekelin(business.plan)) continue;
    try {
      created += await suggestForBusiness(supabase, business.id, business.name);
    } catch (error) {
      console.error("suggestions error", business.id, error);
    }
  }
  return { businesses: businesses?.length ?? 0, created };
}

async function suggestForBusiness(supabase: SupabaseClient, businessId: string, businessName: string): Promise<number> {
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, direction, body, is_bot, source, created_at")
    .eq("business_id", businessId)
    .gte("created_at", new Date(Date.now() - WEEK_MS).toISOString())
    .neq("source", "history")
    .order("conversation_id")
    .order("created_at", { ascending: true })
    .limit(3000);

  // A customer's message(s), then the first reply a person wrote.
  const pairs: Array<{ question: string; answer: string }> = [];
  let pending: string[] = [];
  let conversation: string | null = null;
  for (const m of messages ?? []) {
    if (m.conversation_id !== conversation) {
      conversation = m.conversation_id;
      pending = [];
    }
    if (!m.body) continue;
    if (m.direction === "in") {
      pending.push(m.body);
    } else if (m.is_bot) {
      pending = [];
    } else if (pending.length > 0) {
      pairs.push({ question: pending.join(" / ").slice(0, MAX_TEXT), answer: m.body.slice(0, MAX_TEXT) });
      pending = [];
    }
  }
  if (pairs.length < MIN_TIMES) return 0;

  const [{ data: templates }, { data: earlier }] = await Promise.all([
    supabase.from("templates").select("name, body").eq("business_id", businessId),
    // Pending or dismissed before: don't propose again.
    supabase.from("template_suggestions").select("question").eq("business_id", businessId).neq("status", "approved"),
  ]);
  const existing = [
    ...(templates ?? []).map((t) => `${t.name}: ${t.body.slice(0, 120)}`),
    ...(earlier ?? []).map((s) => s.question),
  ].slice(0, 60);

  const recent = pairs.slice(-MAX_PAIRS);
  const { suggestions, usage } = await proposeTemplates({ businessName, pairs: recent, existing });
  await recordChekelinUsage(supabase, { businessId, kind: "suggestions" }, usage);
  const rows = (suggestions ?? [])
    .filter((s) => s.times >= MIN_TIMES && s.times <= recent.length && s.body.trim() && s.name.trim())
    .filter((s) => TEMPLATE_CATEGORY_ORDER.includes(s.category))
    .slice(0, 5)
    .map((s) => ({
      business_id: businessId,
      question: s.question.trim().slice(0, 200),
      times: s.times,
      name: s.name.trim().slice(0, 80),
      category: s.category,
      body: s.body.trim().slice(0, 1000),
    }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("template_suggestions").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}
