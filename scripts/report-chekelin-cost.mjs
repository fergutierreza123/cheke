// What chekelin cost in the last N days (issue #9): total, per Negocio and
// per conversation, from chekelin_usage (migration 0037). Use it to set the
// real monthly limits in src/lib/plan.ts. Modo prueba is left out.
//
// Usage (from the repo root, Node 22.18+ / 24), with the production keys in
// .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY):
//   npm run report:chekelin-cost            (last 30 days)
//   npm run report:chekelin-cost -- 7       (last 7 days)

import { chekelinCostReport, HNL_PER_USD } from "../src/lib/chekelinCost.ts";

const days = Number(process.argv[2] ?? 30);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (en .env.local).");
  process.exit(1);
}

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const rows = [];
for (let from = 0; ; from += 1000) {
  const query = new URLSearchParams({
    select: "business_id,conversation_id,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens",
    test: "eq.false",
    created_at: `gte.${since}`,
    order: "created_at",
  });
  const res = await fetch(`${url}/rest/v1/chekelin_usage?${query}`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
  if (!res.ok) {
    console.error("No se pudo leer chekelin_usage:", res.status, await res.text());
    process.exit(1);
  }
  const page = await res.json();
  rows.push(...page);
  if (page.length < 1000) break;
}

const bizRes = await fetch(`${url}/rest/v1/businesses?select=id,name,plan`, { headers });
const names = new Map((bizRes.ok ? await bizRes.json() : []).map((b) => [b.id, `${b.name} (${b.plan || "sin plan"})`]));

const report = chekelinCostReport(rows);
const money = (usd) => `US$${usd.toFixed(3)} (L ${(usd * HNL_PER_USD).toFixed(2)})`;

console.log(`chekelin, últimos ${days} días: ${rows.length} llamadas, ${money(report.totalUsd)}\n`);
console.log("Por negocio:");
for (const b of report.businesses) {
  const per = b.perConversationUsd === null ? "—" : money(b.perConversationUsd);
  console.log(`  ${names.get(b.businessId) ?? b.businessId}: ${money(b.costUsd)}, ${b.conversations} conversaciones, ${per} por conversación`);
}
console.log("\nLas 10 conversaciones más caras:");
for (const c of report.conversations.slice(0, 10)) {
  console.log(`  ${c.conversationId} (${names.get(c.businessId) ?? c.businessId}): ${money(c.costUsd)} en ${c.calls} llamadas`);
}
if (report.unpricedModels.length) {
  console.log(`\nModelos sin precio (fuera de los totales): ${report.unpricedModels.join(", ")}. Agrégalos en src/lib/chekelinCost.ts.`);
}
