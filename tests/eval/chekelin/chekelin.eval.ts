import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, it, vi } from "vitest";

// bot.ts pulls in the push and Supabase admin modules; planFor never touches them.
vi.mock("@/lib/push", () => ({ notifyConversation: vi.fn(), sendPushToPeople: vi.fn() }));

import { SCENARIOS } from "./scenarios";
import { deterministicChecks, judge, simulate, transcriptText, type Check, type Transcript } from "./simulate";

// chekelin's eval: simulated customers against the REAL model. Not part of
// `npm test` (it costs money and the model isn't deterministic).
//
//   npm run eval:chekelin                      (key from env or .env.local)
//   EVAL_ONLY=precio,foto EVAL_REPEAT=2 EVAL_ROUND=r2 npm run eval:chekelin
//
// Transcripts and the scorecard go to tests/eval/out/<round>/ (git-ignored).

const round = process.env.EVAL_ROUND || new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const only = (process.env.EVAL_ONLY ?? "").split(",").filter(Boolean);
// Each scenario runs EVAL_REPEAT times (the model isn't deterministic).
const repeat = Math.max(1, Number(process.env.EVAL_REPEAT) || 1);
const scenarios = SCENARIOS.filter((s) => only.length === 0 || only.includes(s.id));
const runs = scenarios.flatMap((scenario) => Array.from({ length: repeat }, (_, i) => ({ scenario, run: i + 1 })));
const outDir = new URL(`../out/${round}/`, import.meta.url);
const results: Array<{ t: Transcript; run: number; checks: Check[] }> = [];

function criterion(id: string): string {
  if (id.startsWith("menciona")) return "menciona_dato";
  if (id.startsWith("no_dice")) return "no_dice_prohibido";
  if (id.startsWith("foto ")) return "foto_enviada";
  return id;
}

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("chekelin eval", () => {
  mkdirSync(outDir, { recursive: true });

  describe.concurrent.each(runs)("$scenario.id #$run", ({ scenario, run }) => {
    it(scenario.title, async ({ expect }) => {
      const t = await simulate(scenario);
      const checks = [...deterministicChecks(t), ...(await judge(t))];
      results.push({ t, run, checks });
      writeFileSync(
        new URL(`${scenario.id}${repeat > 1 ? `-${run}` : ""}.txt`, outDir),
        [
          `# ${scenario.title}`,
          `Objetivo: ${scenario.goal}`,
          "",
          transcriptText(t),
          "",
          "## Checks",
          ...checks.map((c) => `${c.pass ? "PASS" : "FAIL"} ${c.id}${c.note ? ` — ${c.note}` : ""}`),
        ].join("\n"),
      );
      expect.soft(checks.filter((c) => !c.pass).map((c) => `${c.id}: ${c.note}`)).toEqual([]);
    });
  });

  afterAll(() => {
    const rows = scenarios
      .map((scenario) => results.filter((r) => r.t.scenario === scenario))
      .filter((rs) => rs.length > 0)
      .map((rs) => {
        const checks = rs.flatMap((r) => r.checks);
        const passed = checks.filter((c) => c.pass).length;
        const perfect = rs.filter((r) => r.checks.every((c) => c.pass)).length;
        const failed = [...new Set(checks.filter((c) => !c.pass).map((c) => c.id.replace(/^juez:/, "j:")))];
        return `| ${rs[0].t.scenario.id} | ${passed}/${checks.length} | ${perfect}/${rs.length} | ${failed.join(", ")} |`;
      });
    const allChecks = results.flatMap((r) => r.checks);
    const byCriterion = new Map<string, { pass: number; total: number }>();
    for (const c of allChecks) {
      const key = criterion(c.id);
      const s = byCriterion.get(key) ?? { pass: 0, total: 0 };
      s.total++;
      if (c.pass) s.pass++;
      byCriterion.set(key, s);
    }
    const clean = results.filter((r) => r.checks.every((c) => c.pass)).length;
    const card = [
      `# chekelin eval — ${round}`,
      "",
      `Corridas perfectas: **${clean}/${results.length}** (${scenarios.length} escenarios × ${repeat}) · checks: **${allChecks.filter((c) => c.pass).length}/${allChecks.length}**`,
      "",
      "| Escenario | Checks | Corridas perfectas | Fallos |",
      "|---|---|---|---|",
      ...rows,
      "",
      "| Criterio | Pasa |",
      "|---|---|",
      ...[...byCriterion.entries()].map(([k, s]) => `| ${k} | ${s.pass}/${s.total} |`),
    ].join("\n");
    writeFileSync(new URL("scorecard.md", outDir), card);
    console.log(`\n${card}\n`);
  });
});
