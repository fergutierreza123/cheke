// A small fake of the Supabase client for server-action tests: every query
// is recorded, and resolves with the result the test queued for that table
// (or `{ data: null, error: null }`).
type Result = { data?: unknown; error?: unknown; count?: number };

export type Call = { table: string; ops: Array<{ op: string; args: unknown[] }> };

export function fakeSupabase() {
  const queued: Record<string, Result[]> = {};
  const calls: Call[] = [];

  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "order", "limit", "single", "maybeSingle"]) {
      chain[op] = (...args: unknown[]) => {
        call.ops.push({ op, args });
        return chain;
      };
    }
    chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(queued[table]?.shift() ?? { data: null, error: null }).then(resolve, reject);
    return chain;
  };

  return {
    client: { from, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null } }) } },
    calls,
    // The next query on `table` returns this.
    queue(table: string, result: Result) {
      (queued[table] ??= []).push(result);
    },
    // Calls on `table` that used `op` (e.g. "insert").
    writes(table: string, op: string) {
      return calls.filter((c) => c.table === table && c.ops.some((o) => o.op === op));
    },
  };
}
