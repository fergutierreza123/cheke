"use client";

import { useMemo, useState } from "react";
import { STAGE_META, STAGE_ORDER, CHANNEL_META, formatLempiras } from "@/lib/format";
import { ChannelIcon } from "@/components/ChannelIcon";
import type { ChannelType, ConversationWithContact } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import type { StoreNames } from "@/components/StoreTag";
import type { FirstResponseTimes } from "@/lib/analyticsServer";
import { FirstResponseCard } from "./FirstResponseCard";
import { adCounts, channelShares, periodStart, salesSummary, type AnalyticsRange } from "@/lib/analytics";

type Range = AnalyticsRange;
const RANGE_LABEL: Record<Range, string> = { semana: "Esta semana", mes: "Este mes", trimestre: "Este trimestre" };

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function AnalyticsView({
  conversations,
  storeNames = null,
  people = [],
  firstResponse = null,
}: {
  conversations: ConversationWithContact[];
  // "Todas las tiendas": the totals above plus a Tienda-by-Tienda comparison.
  storeNames?: StoreNames | null;
  // Teammates, only passed once conversations are assigned to someone.
  people?: Array<{ id: string; email: string }>;
  firstResponse?: FirstResponseTimes | null;
}) {
  const [range, setRange] = useState<Range>("mes");
  // Captured once per mount rather than read fresh in useMemo/render — an
  // impure Date.now() call inside those is flagged (and rightly so: it'd
  // make the memoized value silently drift as time passes without any
  // prop/state actually changing).
  const [now] = useState(() => Date.now());

  const inRange = useMemo(() => {
    const cutoff = periodStart(range, now);
    return conversations.filter((c) => new Date(c.created_at).getTime() >= cutoff);
  }, [conversations, range, now]);

  const { won, revenue, conversionRate } = salesSummary(inRange);
  const activeNow = conversations.filter((c) => c.stage !== "ganado" && c.stage !== "perdido").length;

  const kpis = [
    { label: "Ventas cerradas", value: formatLempiras(revenue), hint: `${won} venta${won === 1 ? "" : "s"} ganada${won === 1 ? "" : "s"}` },
    { label: "Tasa de conversión", value: `${conversionRate}%`, hint: "de las conversaciones cerradas" },
    { label: "Contactos nuevos", value: String(inRange.length), hint: RANGE_LABEL[range].toLowerCase() },
    { label: "Conversaciones activas", value: String(activeNow), hint: "en el chekeo ahora" },
  ];

  const funnel = useMemo(() => {
    const counts = STAGE_ORDER.map((stage) => ({
      stage,
      label: STAGE_META[stage].label,
      color: STAGE_META[stage].color,
      count: inRange.filter((c) => c.stage === stage).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    return counts.map((c) => ({ ...c, pct: Math.round((c.count / max) * 100) }));
  }, [inRange]);

  const channelBreakdown = useMemo(() => {
    const shares = channelShares(inRange);
    return (["whatsapp", "instagram", "facebook"] as ChannelType[]).map((type) => ({
      type,
      label: CHANNEL_META[type].label,
      color: CHANNEL_META[type].color,
      pct: shares[type],
    }));
  }, [inRange]);

  const trend = useMemo(() => {
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const count = conversations.filter((c) => {
        const t = new Date(c.created_at).getTime();
        return t >= date.getTime() && t < next.getTime();
      }).length;
      days.push({ day: DAY_LABELS[date.getDay()], count });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    return days.map((d) => ({ ...d, barHeight: Math.round((d.count / max) * 120) + 8 }));
  }, [conversations, now]);

  // One row per Tienda, same numbers as the totals above.
  const byStore = useMemo(() => {
    if (!storeNames) return [];
    return Object.entries(storeNames).map(([id, name]) => {
      const rows = inRange.filter((c) => c.store_id === id);
      const summary = salesSummary(rows);
      return { id, name, revenue: summary.revenue, won: summary.won, conversion: summary.conversionRate, fresh: rows.length };
    });
  }, [storeNames, inRange]);
  const topStoreRevenue = Math.max(1, ...byStore.map((s) => s.revenue));

  // Sales per person (assigned conversations won in the range).
  const byPerson = useMemo(() => {
    if (people.length === 0) return [];
    return people
      .map((p) => {
        const summary = salesSummary(inRange.filter((c) => c.assigned_to === p.id));
        return { ...p, won: summary.won, revenue: summary.revenue };
      })
      .filter((p) => p.won > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [people, inRange]);

  // Chats per ad (Click-to-WhatsApp / Instagram / Messenger), hidden until one arrives.
  const byAd = useMemo(() => adCounts(conversations, periodStart(range, now)), [conversations, range, now]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col items-stretch gap-3 border-b border-border bg-surface px-4 py-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:px-8 lg:py-[18px]">
        <div>
          <h1 className="flex items-center justify-between gap-2 font-heading text-xl font-semibold text-ink">
            Analítica de ventas
            <BrandMark />
          </h1>
          <p className="hidden text-[13.5px] text-ink-muted sm:block">Cómo avanza tu chekeo de ventas, canal por canal</p>
        </div>
        {/* Equal-width segmented row on phones, compact pills on desktop. */}
        <div className="grid grid-cols-3 gap-1.5 lg:flex">
          {(["semana", "mes", "trimestre"] as Range[]).map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`min-h-10 rounded-lg border px-1 py-2 text-[13.5px] font-semibold transition-colors lg:min-h-0 lg:px-3.5 ${
                  active ? "border-brand-dark bg-brand-dark text-white" : "border-border bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-4 lg:gap-5">
          {/* 2×2 grid on phones/tablets; the original wrapping flex row on desktop. */}
          <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-wrap lg:gap-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="min-w-0 rounded-2xl border border-border bg-surface px-4 py-3.5 lg:min-w-[200px] lg:flex-1 lg:px-5 lg:py-4.5">
                <div className="text-[12.5px] leading-snug text-ink-muted lg:text-[13.5px] lg:leading-normal">{kpi.label}</div>
                <div className="truncate font-heading text-[22px] font-bold text-ink lg:text-[26px]">{kpi.value}</div>
                <div className="text-xs leading-snug text-brand lg:leading-normal">{kpi.hint}</div>
              </div>
            ))}
          </div>

          {byStore.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Por tienda</div>
              <div className="mb-3.5 text-[13px] text-ink-muted">Cómo le va a cada tienda en {RANGE_LABEL[range].toLowerCase()}</div>
              <div className="flex flex-col">
                <div className="hidden justify-between border-b border-border py-2 text-[12px] uppercase tracking-wide text-ink-soft sm:flex">
                  <div>Tienda</div>
                  <div className="flex gap-6 tabular-nums">
                    <div className="w-16 text-right">Nuevos</div>
                    <div className="w-16 text-right">Cierre</div>
                    <div className="w-24 text-right">Vendido</div>
                  </div>
                </div>
                {byStore.map((s) => (
                  <div key={s.id} className="border-b border-border py-2.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-3 text-[13.5px] text-ink">
                      <div className="min-w-0 truncate font-semibold">{s.name}</div>
                      <div className="flex shrink-0 gap-3 tabular-nums sm:gap-6">
                        <div className="w-16 text-right text-ink-muted">
                          {s.fresh}
                          <span className="sm:hidden"> nuevos</span>
                        </div>
                        <div className="w-16 text-right text-ink-muted">
                          {s.conversion}%<span className="sm:hidden"> cierre</span>
                        </div>
                        <div className="w-24 text-right font-semibold">{formatLempiras(s.revenue)}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-md bg-surface-2">
                      <div className="h-full rounded-md bg-brand" style={{ width: `${Math.round((s.revenue / topStoreRevenue) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {byPerson.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Por persona</div>
              <div className="mb-3.5 text-[13px] text-ink-muted">Ventas ganadas en conversaciones asignadas</div>
              {byPerson.map((p) => (
                <div key={p.id} className="flex justify-between gap-3 border-b border-border py-2.5 text-[13.5px] text-ink last:border-b-0">
                  <div className="min-w-0 truncate">{p.email}</div>
                  <div className="flex shrink-0 gap-6 tabular-nums">
                    <div className="text-ink-muted">
                      {p.won} venta{p.won === 1 ? "" : "s"}
                    </div>
                    <div className="w-24 text-right font-semibold">{formatLempiras(p.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {firstResponse && <FirstResponseCard rows={firstResponse[range]} period={RANGE_LABEL[range].toLowerCase()} />}
          {byAd.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Por anuncio</div>
              <div className="mb-3.5 text-[13px] text-ink-muted">Chats que llegaron desde un anuncio o publicación</div>
              {byAd.map((ad, i) => (
                <div key={i} className="flex justify-between gap-3 border-b border-border py-2.5 text-[13.5px] text-ink last:border-b-0">
                  <div className="min-w-0 truncate">{ad.label}</div>
                  <div className="flex shrink-0 gap-6 tabular-nums">
                    <div className="text-ink-muted">
                      {ad.won} venta{ad.won === 1 ? "" : "s"}
                    </div>
                    <div className="w-20 text-right font-semibold">
                      {ad.chats} chat{ad.chats === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* One grid spanning both rows, not two independent flex rows —
              each flex row was computing its own column widths from its
              own children's flex-basis/min-width, so the gap between left
              and right cards landed at a different x position per row
              instead of lining up into a clean 2-column grid. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.3fr_1fr] lg:gap-4">
            <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Embudo por etapa</div>
              <div className="mb-4 text-[13px] text-ink-muted">Cuántos contactos hay en cada etapa del chekeo</div>
              <div className="flex flex-col gap-3">
                {funnel.map((f) => (
                  <div key={f.stage} className="flex items-center gap-2.5">
                    <div className="w-[92px] shrink-0 text-[12.5px] leading-tight text-ink-muted lg:w-32 lg:text-[13.5px] lg:leading-normal">{f.label}</div>
                    <div className="h-[18px] flex-1 overflow-hidden rounded-md bg-surface-2">
                      <div className="h-full rounded-md" style={{ width: `${f.pct}%`, background: f.color }} />
                    </div>
                    <div className="w-8 shrink-0 text-right text-[13.5px] font-bold text-ink">{f.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Conversaciones por canal</div>
              <div className="mb-4 text-[13px] text-ink-muted">De dónde llegan tus clientes</div>
              <div className="flex flex-col gap-3.5">
                {channelBreakdown.map((c) => (
                  <div key={c.type}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[13.5px] text-ink">
                        <ChannelIcon type={c.type} className="h-4 w-4 shrink-0 rounded-full" />
                        {c.label}
                      </div>
                      <div className="text-[13.5px] font-bold text-ink">{c.pct}%</div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-md bg-surface-2">
                      <div className="h-full rounded-md" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col rounded-2xl border border-border bg-surface p-4 lg:col-span-2 lg:p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Nuevas conversaciones — últimos 7 días</div>
              <div className="mb-4.5 text-[13px] text-ink-muted">Mensajes entrantes de los tres canales combinados</div>
              <div className="flex h-[140px] items-end gap-2 px-1 lg:gap-4">
                {trend.map((t, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="text-[11.5px] text-ink-muted">{t.count}</div>
                    <div className="w-[22px] rounded-t-md bg-brand" style={{ height: `${t.barHeight}px` }} />
                    <div className="text-[11.5px] text-ink-soft">{t.day}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
