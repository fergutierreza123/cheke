import { formatWait } from "@/lib/analytics";
import type { FirstResponseRow } from "@/lib/analyticsServer";

// "Tiempo de primera respuesta": per person, the median wait from the
// customer's message (or chekelin's hand-off) to that person's first reply.
export function FirstResponseCard({ rows, period }: { rows: FirstResponseRow[]; period: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
      <div className="font-heading text-[15.5px] font-semibold text-ink">Tiempo de primera respuesta</div>
      <div className="mb-3.5 text-[13px] text-ink-muted">
        Cuánto espera el cliente a que una persona le conteste, {period} (sin contar a chekelin)
      </div>
      {rows.length === 0 ? (
        <div className="py-2.5 text-[13.5px] text-ink-muted">Todavía no hay respuestas de tu equipo en este periodo.</div>
      ) : (
        rows.map((p) => (
          <div key={p.id} className="flex justify-between gap-3 border-b border-border py-2.5 text-[13.5px] text-ink last:border-b-0">
            <div className="min-w-0 truncate">{p.name}</div>
            <div className="flex shrink-0 gap-6 tabular-nums">
              <div className="text-ink-muted">
                {p.replies} respuesta{p.replies === 1 ? "" : "s"}
              </div>
              <div className="w-24 text-right font-semibold">{formatWait(p.medianSeconds)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
