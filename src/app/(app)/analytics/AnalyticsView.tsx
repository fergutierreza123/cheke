"use client";

import { useMemo, useState } from "react";
import { STAGE_META, STAGE_ORDER, CHANNEL_META, formatLempiras } from "@/lib/format";
import { ChannelIcon } from "@/components/ChannelIcon";
import type { ChannelType, ConversationWithContact, Product } from "@/lib/types";

type Range = "semana" | "mes" | "trimestre";
const RANGE_DAYS: Record<Range, number> = { semana: 7, mes: 30, trimestre: 90 };
const RANGE_LABEL: Record<Range, string> = { semana: "Esta semana", mes: "Este mes", trimestre: "Este trimestre" };

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function AnalyticsView({
  conversations,
  products,
}: {
  conversations: ConversationWithContact[];
  products: Product[];
}) {
  const [range, setRange] = useState<Range>("mes");
  // Captured once per mount rather than read fresh in useMemo/render — an
  // impure Date.now() call inside those is flagged (and rightly so: it'd
  // make the memoized value silently drift as time passes without any
  // prop/state actually changing).
  const [now] = useState(() => Date.now());

  const inRange = useMemo(() => {
    const cutoff = now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    return conversations.filter((c) => new Date(c.created_at).getTime() >= cutoff);
  }, [conversations, range, now]);

  const won = inRange.filter((c) => c.stage === "ganado");
  const lost = inRange.filter((c) => c.stage === "perdido");
  const revenue = won.reduce((sum, c) => sum + (c.value_hnl ?? 0), 0);
  const conversionRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const activeNow = conversations.filter((c) => c.stage !== "ganado" && c.stage !== "perdido").length;

  const kpis = [
    { label: "Ventas cerradas", value: formatLempiras(revenue), hint: `${won.length} venta${won.length === 1 ? "" : "s"} ganada${won.length === 1 ? "" : "s"}` },
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
    const total = inRange.length || 1;
    return (["whatsapp", "instagram", "facebook"] as ChannelType[]).map((type) => {
      const count = inRange.filter((c) => c.channel?.type === type).length;
      return { type, label: CHANNEL_META[type].label, color: CHANNEL_META[type].color, pct: Math.round((count / total) * 100) };
    });
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

  const topProducts = useMemo(() => {
    return [...products]
      .map((p) => ({ ...p, totalValue: p.price_hnl * p.stock }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);
  }, [products]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-8 py-[18px]">
        <div>
          <h1 className="font-heading text-xl font-semibold text-ink">Analítica de ventas</h1>
          <p className="text-[13.5px] text-ink-muted">Cómo avanza tu Chekeo de ventas, canal por canal</p>
        </div>
        <div className="flex gap-1.5">
          {(["semana", "mes", "trimestre"] as Range[]).map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                  active ? "border-brand-dark bg-brand-dark text-white" : "border-border bg-surface text-ink-muted hover:bg-surface-2"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="flex-1 min-w-[200px] rounded-2xl border border-border bg-surface px-5 py-4.5">
                <div className="text-[13.5px] text-ink-muted">{kpi.label}</div>
                <div className="font-heading text-[26px] font-bold text-ink">{kpi.value}</div>
                <div className="text-xs text-brand">{kpi.hint}</div>
              </div>
            ))}
          </div>

          {/* One grid spanning both rows, not two independent flex rows —
              each flex row was computing its own column widths from its
              own children's flex-basis/min-width, so the gap between left
              and right cards landed at a different x position per row
              instead of lining up into a clean 2-column grid. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Embudo por etapa</div>
              <div className="mb-4 text-[13px] text-ink-muted">Cuántos contactos hay en cada etapa del Chekeo</div>
              <div className="flex flex-col gap-3">
                {funnel.map((f) => (
                  <div key={f.stage} className="flex items-center gap-2.5">
                    <div className="w-32 shrink-0 text-[13.5px] text-ink-muted">{f.label}</div>
                    <div className="h-[18px] flex-1 overflow-hidden rounded-md bg-surface-2">
                      <div className="h-full rounded-md" style={{ width: `${f.pct}%`, background: f.color }} />
                    </div>
                    <div className="w-8 shrink-0 text-right text-[13.5px] font-bold text-ink">{f.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5">
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

            {/* self-start, not the grid default (stretch) — with real data
                these two cards rarely have comparable content length (a
                fixed-height chart vs. a handful of product rows), and
                stretching the sparser one to match just leaves a dead void
                inside it instead of looking "aligned". */}
            <div className="self-start rounded-2xl border border-border bg-surface p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Nuevas conversaciones — últimos 7 días</div>
              <div className="mb-4.5 text-[13px] text-ink-muted">Mensajes entrantes de los tres canales combinados</div>
              <div className="flex h-[140px] items-end gap-4 px-1">
                {trend.map((t, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="text-[11.5px] text-ink-muted">{t.count}</div>
                    <div className="w-[22px] rounded-t-md bg-brand" style={{ height: `${t.barHeight}px` }} />
                    <div className="text-[11.5px] text-ink-soft">{t.day}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-[180px] self-start rounded-2xl border border-border bg-surface p-5">
              <div className="font-heading text-[15.5px] font-semibold text-ink">Productos con más valor en existencia</div>
              <div className="mb-3.5 text-[13px] text-ink-muted">Precio × stock — para saber dónde está tu capital</div>
              {topProducts.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-ink-soft">Todavía no tienes productos en el catálogo.</div>
              ) : (
                <div className="flex flex-col">
                  <div className="flex justify-between border-b border-border py-2 text-[12px] uppercase tracking-wide text-ink-soft">
                    <div>Producto</div>
                    <div className="flex gap-7">
                      <div>Stock</div>
                      <div className="w-16 text-right">Valor</div>
                    </div>
                  </div>
                  {topProducts.map((p) => (
                    <div key={p.id} className="flex justify-between border-b border-border py-2.5 text-[13.5px] text-ink last:border-b-0">
                      <div className="truncate pr-2">{p.name}</div>
                      <div className="flex shrink-0 gap-7">
                        <div className="w-5 text-center text-ink-muted">{p.stock}</div>
                        <div className="w-16 text-right font-semibold">{formatLempiras(p.totalValue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
