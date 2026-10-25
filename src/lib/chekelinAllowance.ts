import type { SupabaseClient } from "@supabase/supabase-js";
import { chekelinAllowance, chekelinMonth, nextChekelinMonthLabel } from "@/lib/plan";
import { sendPushToPeople } from "@/lib/push";
import type { UsageRecord } from "@/lib/chekelinCost";

// chekelin's monthly allowance and cost records (issue #9, migration 0037).
// The rules and numbers are in src/lib/plan.ts; this file reads and writes
// the rows. Server-only, with the service-role client (webhooks, timers),
// except getChekelinUsage, which the screens call with the signed-in
// client (RLS: Dueños only).
//
// Before migration 0037 runs, the tables and columns don't exist: every
// read here then answers "no limit" and every write is skipped, so chekelin
// keeps working exactly as before.

type Supabase = SupabaseClient;

export type ChekelinUsage = {
  // "2026-10-01": the month in Honduras.
  month: string;
  // Conversaciones atendidas por chekelin this month.
  used: number;
  // Null = the plan has no limit.
  allowance: number | null;
};

// This month's count and limit for a Negocio. Null when it can't be read
// (before migration 0037, or a person who isn't a Dueño).
export async function getChekelinUsage(supabase: Supabase, businessId: string, nowMs = Date.now()): Promise<ChekelinUsage | null> {
  const month = chekelinMonth(nowMs);
  const [{ data: business, error: businessError }, { count: openStores }, { count: used, error: countError }] = await Promise.all([
    supabase
      .from("businesses")
      .select("plan, is_demo, chekelin_extra, chekelin_extra_month")
      .eq("id", businessId)
      .maybeSingle(),
    supabase.from("stores").select("id", { count: "exact", head: true }).eq("business_id", businessId).is("archived_at", null),
    supabase
      .from("chekelin_monthly_conversations")
      .select("conversation_id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("month", month),
  ]);
  if (businessError || countError || !business) return null;
  const allowance = business.is_demo
    ? null
    : chekelinAllowance({
        plan: business.plan ?? "",
        openStoreCount: openStores ?? 1,
        month,
        extra: business.chekelin_extra,
        extraMonth: business.chekelin_extra_month,
      });
  return { month, used: used ?? 0, allowance };
}

async function countedThisMonth(supabase: Supabase, conversationId: string, month: string): Promise<boolean> {
  const { data } = await supabase
    .from("chekelin_monthly_conversations")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("month", month)
    .maybeSingle();
  return Boolean(data);
}

// May chekelin attend this conversation now? Yes while the Negocio is under
// its limit, and always for a conversation it already attended this month
// (a sale is never cut in half). Answers yes when the count can't be read.
// Two brand-new conversations at the very edge can both pass: the limit can
// be overshot by a chat or two, never by more.
export async function mayChekelinAttend(
  supabase: Supabase,
  conv: { id: string; businessId: string },
  nowMs = Date.now(),
): Promise<boolean> {
  const usage = await getChekelinUsage(supabase, conv.businessId, nowMs);
  if (!usage || usage.allowance === null || usage.used < usage.allowance) return true;
  return countedThisMonth(supabase, conv.id, usage.month);
}

// chekelin sent this conversation a message: it counts for this month
// (once; a second message in the same month changes nothing).
export async function countChekelinConversation(
  supabase: Supabase,
  conv: { id: string; businessId: string; storeId: string },
  nowMs = Date.now(),
): Promise<void> {
  const { error } = await supabase.from("chekelin_monthly_conversations").upsert(
    { business_id: conv.businessId, store_id: conv.storeId, conversation_id: conv.id, month: chekelinMonth(nowMs) },
    { onConflict: "conversation_id,month", ignoreDuplicates: true },
  );
  if (error) console.error("chekelin monthly count error", error.message);
}

export const CHEKELIN_LIMIT_TITLE = "chekelin llegó al límite de tu plan este mes";

// The Negocio reached its limit: the Dueños get ONE notice this month. The
// month is claimed with a conditional update first, so two chats arriving
// together never send it twice.
export async function noticeChekelinLimit(
  supabase: Supabase,
  conv: { businessId: string; storeId: string },
  nowMs = Date.now(),
): Promise<void> {
  const month = chekelinMonth(nowMs);
  const claim = async (when: "never" | "earlier") => {
    const update = supabase.from("businesses").update({ chekelin_limit_notice_month: month }).eq("id", conv.businessId);
    const { data } = await (when === "never"
      ? update.is("chekelin_limit_notice_month", null)
      : update.lt("chekelin_limit_notice_month", month)
    ).select("id");
    return (data?.length ?? 0) > 0;
  };
  if (!(await claim("never")) && !(await claim("earlier"))) return;

  const { data: owners } = await supabase.from("members").select("user_id").eq("business_id", conv.businessId).eq("role", "owner");
  // No price and no way to pay in the text: it also shows inside the store
  // apps (Apple 3.1.3(f)). The options are in Mi cuenta, on the web.
  await sendPushToPeople(supabase, conv.businessId, conv.storeId, (owners ?? []).map((o) => o.user_id as string), {
    title: CHEKELIN_LIMIT_TITLE,
    body: `Los chats nuevos los atiende tu equipo hasta el ${nextChekelinMonthLabel(nowMs)}. En Mi cuenta ves cómo seguir.`,
    url: "/account",
  });
}

export type ChekelinCallKind = "seller" | "simple_fact" | "comment" | "suggestions";

// What one chekelin model call used, for `npm run report:chekelin-cost`.
// Never blocks or fails chekelin's work.
export async function recordChekelinUsage(
  supabase: Supabase,
  where: { businessId: string; storeId?: string | null; conversationId?: string | null; kind: ChekelinCallKind; test?: boolean },
  usage: UsageRecord[] | undefined,
): Promise<void> {
  if (!usage?.length) return;
  try {
    const { error } = await supabase.from("chekelin_usage").insert(
      usage.map((u) => ({
        business_id: where.businessId,
        store_id: where.storeId ?? null,
        conversation_id: where.conversationId ?? null,
        kind: where.kind,
        test: where.test === true,
        ...u,
      })),
    );
    if (error) console.error("chekelin usage record error", error.message);
  } catch (error) {
    console.error("chekelin usage record error", error);
  }
}
