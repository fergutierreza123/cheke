import { randomUUID } from "node:crypto";

// A tiny in-memory stand-in for the Supabase service-role client, for tests
// that run a whole webhook: rows live in plain arrays, and the query builder
// understands the filters the webhooks use (eq, neq, in, is, lt/lte/gt,
// order, limit, single/maybeSingle). Unique columns answer 23505 like
// Postgres. No RLS: it's the service role.
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const UNIQUE: Record<string, string[]> = {
  messages: ["external_message_id"],
  post_comments: ["external_comment_id"],
};

export function memoryDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (tables[table] ??= []);

  function duplicate(table: string, row: Row, except?: Row): boolean {
    return (UNIQUE[table] ?? []).some(
      (col) => row[col] != null && rowsOf(table).some((r) => r !== except && r[col] === row[col]),
    );
  }

  function from(table: string) {
    const filters: Filter[] = [];
    let action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let returning = false;
    let mode: "many" | "single" | "maybeSingle" = "many";
    let limit: number | null = null;
    let order: { col: string; ascending: boolean } | null = null;

    const run = (): { data: unknown; error: { code?: string; message: string } | null } => {
      const all = rowsOf(table);
      let out: Row[] = [];
      if (action === "insert" || action === "upsert") {
        for (const input of Array.isArray(payload) ? payload : [payload!]) {
          const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...input };
          if (duplicate(table, row)) {
            if (action === "upsert" && upsertOptions.ignoreDuplicates) continue;
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          all.push(row);
          out.push(row);
        }
      } else {
        let matched = all.filter((r) => filters.every((f) => f(r)));
        if (order) {
          const { col, ascending } = order;
          matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (ascending ? 1 : -1));
        }
        if (limit !== null) matched = matched.slice(0, limit);
        if (action === "update") {
          for (const r of matched) {
            const next = { ...r, ...(payload as Row) };
            if (duplicate(table, next, r)) return { data: null, error: { code: "23505", message: "duplicate" } };
            Object.assign(r, payload);
          }
        } else if (action === "delete") {
          tables[table] = all.filter((r) => !matched.includes(r));
        }
        out = matched;
      }
      const data = action === "select" || returning ? out.map((r) => ({ ...r })) : null;
      if (mode === "many") return { data, error: null };
      if (!data) return { data: null, error: null };
      if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } };
      if (data.length === 0) {
        return mode === "single" ? { data: null, error: { code: "PGRST116", message: "no rows" } } : { data: null, error: null };
      }
      return { data: data[0], error: null };
    };

    const builder = {
      select() {
        if (action !== "select") returning = true;
        return builder;
      },
      insert(rows: Row | Row[]) {
        action = "insert";
        payload = rows;
        return builder;
      },
      upsert(rows: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        action = "upsert";
        payload = rows;
        upsertOptions = options;
        return builder;
      },
      update(patch: Row) {
        action = "update";
        payload = patch;
        return builder;
      },
      delete() {
        action = "delete";
        return builder;
      },
      eq(col: string, value: unknown) {
        filters.push((r) => r[col] === value);
        return builder;
      },
      neq(col: string, value: unknown) {
        filters.push((r) => r[col] !== value);
        return builder;
      },
      in(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      is(col: string, value: null) {
        filters.push((r) => (r[col] ?? null) === value);
        return builder;
      },
      not(col: string, op: string, value: unknown) {
        filters.push((r) => (op === "is" ? (r[col] ?? null) !== value : r[col] !== value));
        return builder;
      },
      lt(col: string, value: string) {
        filters.push((r) => r[col] != null && String(r[col]) < value);
        return builder;
      },
      lte(col: string, value: string) {
        filters.push((r) => r[col] != null && String(r[col]) <= value);
        return builder;
      },
      gt(col: string, value: string) {
        filters.push((r) => r[col] != null && String(r[col]) > value);
        return builder;
      },
      // PostgREST `or` filters aren't parsed: they match everything.
      or() {
        return builder;
      },
      order(col: string, { ascending = true }: { ascending?: boolean } = {}) {
        order = { col, ascending };
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      single() {
        mode = "single";
        return builder;
      },
      maybeSingle() {
        mode = "maybeSingle";
        return builder;
      },
      then(resolve: (r: ReturnType<typeof run>) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    client: { from, rpc: async () => ({ data: null, error: null }) },
    rows: (table: string) => rowsOf(table),
  };
}
