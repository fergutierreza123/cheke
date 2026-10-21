# Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | `tests/unit`: the logic in `src/lib` and the proxy (message parsing, payment links, Respuestas rápidas, plans, encryption, webhook signatures, chekelin's decisions, reply windows…). Supabase and `fetch` are faked. | nothing |
| `npm run test:db` | `tests/db`: applies every migration in `supabase/migrations`, in order, to an in-memory Postgres (PGlite), then checks Row Level Security between Negocios, Tiendas and roles (Dueño, Gerente, Agente). | nothing (no Docker, no Supabase project) |
| `npm run test:watch` | Re-runs unit tests on every save. | |
| `npm run eval:chekelin` | `tests/eval`: simulated customers talk to chekelin through the REAL model (decideSeller → planFor → what goes out → chekeo stage), scored by fixed checks and a strict LLM judge. Transcripts and the scorecard go to `tests/eval/out/` (git-ignored). Costs money; never part of `npm test`. Options: `EVAL_ONLY=precio,foto`, `EVAL_REPEAT=2`, `EVAL_ROUND=name`, `EVAL_ENV_FILE=path/.env.local`. | `ANTHROPIC_API_KEY` (env or `.env.local`) |

GitHub runs lint, the TypeScript check and both test commands on every pull
request once `docs/ci/ci.yml` is moved to `.github/workflows/ci.yml` (see the
top of that file).

## Adding tests

- A new helper in `src/lib`: add `tests/unit/<name>.test.ts`.
- A new migration: it is picked up by `npm run test:db` automatically. If it
  adds a table with business data, add its isolation checks to
  `tests/db/rls.test.ts` (who can read it, who can write it).
- A webhook route: `tests/unit/webhooks.test.ts` sends signed requests to
  the route and checks the rows it saves in `tests/unit/memoryDb.ts`, a small
  in-memory stand-in for the service-role Supabase client.
- `tests/db/harness.ts` stubs what Supabase provides (`auth.users`,
  `auth.uid()`, storage, roles). `as(userId, sql)` runs a query as that
  signed-in person; `as(null, sql)` as the service role (webhooks).
