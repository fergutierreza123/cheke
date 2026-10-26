import { createClient } from "@/lib/supabase/server";
import type { CurrentBusiness } from "@/lib/business";
import type { AnalyticsRange } from "@/lib/analytics";
import { getTeamMembers } from "@/lib/team";

export type FirstResponseRow = { id: string; name: string; replies: number; medianSeconds: number };
export type FirstResponseTimes = Record<AnalyticsRange, FirstResponseRow[]>;

// Analítica's "Tiempo de primera respuesta" per person (migration 0041),
// for the selected Tiendas. Agentes only see their own row. Null until the
// migration runs, so the card stays hidden.
export async function getFirstResponseTimes(business: CurrentBusiness): Promise<FirstResponseTimes | null> {
  if (business.scopeStoreIds.length === 0) return null;
  const supabase = await createClient();
  const [{ data, error }, members] = await Promise.all([
    supabase.rpc("first_response_times", { p_store_ids: business.scopeStoreIds }),
    getTeamMembers(business.id),
  ]);
  if (error) return null;

  const names = new Map(members.map((m) => [m.user_id, m.name || m.email]));
  const result: FirstResponseTimes = { semana: [], mes: [], trimestre: [] };
  for (const r of (data ?? []) as Array<{ period: AnalyticsRange; user_id: string; replies: number; median_seconds: number }>) {
    const name = names.get(r.user_id);
    // People who left the Negocio are left out.
    if (!name || !result[r.period]) continue;
    if (business.role === "agent" && r.user_id !== business.userId) continue;
    result[r.period].push({ id: r.user_id, name, replies: r.replies, medianSeconds: r.median_seconds });
  }
  for (const rows of Object.values(result)) rows.sort((a, b) => a.medianSeconds - b.medianSeconds);
  return result;
}
