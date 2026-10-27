import type { ChannelType } from "@/lib/types";

// Analítica's numbers, kept apart from the screen so they can be checked.
// Safe to import anywhere (pure).

export type AnalyticsRange = "semana" | "mes" | "trimestre";

// Where "Esta semana" (from Monday), "Este mes" (from the 1st) and "Este
// trimestre" (Jan/Apr/Jul/Oct 1st) begin, at midnight local time. These are
// calendar periods, as their labels say, not "the last 7/30/90 days".
export function periodStart(range: AnalyticsRange, now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (range === "semana") {
    const sinceMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - sinceMonday);
  } else if (range === "mes") {
    d.setDate(1);
  } else {
    d.setMonth(d.getMonth() - (d.getMonth() % 3), 1);
  }
  return d.getTime();
}

// A deal value as saved (number, or text from a Postgres numeric column).
function amount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Ventas cerradas, ganadas/perdidas and Tasa de conversión (won out of the
// closed ones, in whole percent).
export function salesSummary(rows: Array<{ stage: string; value_hnl: number | string | null }>) {
  const won = rows.filter((r) => r.stage === "ganado");
  const lost = rows.filter((r) => r.stage === "perdido").length;
  const revenue = Math.round(won.reduce((sum, r) => sum + amount(r.value_hnl), 0) * 100) / 100;
  const closed = won.length + lost;
  return { won: won.length, lost, revenue, conversionRate: closed > 0 ? Math.round((won.length / closed) * 100) : 0 };
}

// "Por anuncio": chats that came from an ad or post since `since`, grouped by
// ad (same ad id = same ad), most chats first, with the sales won from them.
export function adCounts(
  rows: Array<{
    referral_source?: string | null;
    referral_ad_id?: string | null;
    referral_headline?: string | null;
    referral_at?: string | null;
    stage: string;
  }>,
  since: number,
) {
  const ads = new Map<string, { label: string; chats: number; won: number }>();
  for (const r of rows) {
    if (!r.referral_source || !r.referral_at || new Date(r.referral_at).getTime() < since) continue;
    const key = r.referral_ad_id ?? r.referral_headline ?? r.referral_source;
    const ad = ads.get(key) ?? {
      label: r.referral_headline ?? (r.referral_source === "anuncio" ? "Anuncio sin título" : "Publicación sin título"),
      chats: 0,
      won: 0,
    };
    ad.chats += 1;
    if (r.stage === "ganado") ad.won += 1;
    ads.set(key, ad);
  }
  return [...ads.values()].sort((a, b) => b.chats - a.chats);
}

// Share of conversations per channel, in whole percent. Contacts added by
// hand in chekeo have no channel and are left out.
export function channelShares(rows: Array<{ channel?: { type: string } | null }>): Record<ChannelType, number> {
  const types: ChannelType[] = ["whatsapp", "instagram", "facebook"];
  const withChannel = rows.filter((r) => r.channel && (types as string[]).includes(r.channel.type));
  const total = withChannel.length;
  return Object.fromEntries(
    types.map((t) => [t, total ? Math.round((withChannel.filter((r) => r.channel!.type === t).length / total) * 100) : 0]),
  ) as Record<ChannelType, number>;
}
