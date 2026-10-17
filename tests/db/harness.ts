// Reusable database harness for `npm run test:db`.
//
// Applies every migration in supabase/migrations, in order, to an in-memory
// Postgres (PGlite: real Postgres compiled to WebAssembly, no Docker and no
// Supabase project needed), on top of small stubs for what Supabase provides
// (auth.users, auth.uid(), the storage schema, the anon/authenticated/
// service_role roles, the realtime publication). Then `as(user, sql)` runs a
// query as that signed-in person, with Row Level Security applied exactly as
// PostgREST does it.
//
// Adapted from the one-off migration checks used while building 0018–0023.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
}

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (
    id uuid primary key, email text, phone text, phone_change text default '',
    raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated, anon, service_role;
  create publication supabase_realtime;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

// PGlite has pgcrypto's gen_random_uuid() built in; extensions are skipped.
const stripExtensions = (sql: string) => sql.replace(/create extension[^;]*;/gi, "");

export type Result = { rows: Record<string, unknown>[]; error?: undefined } | { rows?: undefined; error: string };

export type TestDb = {
  db: PGlite;
  // As a signed-in person (RLS on). `null` = the service role (webhooks, cron), RLS off.
  as(user: string | null, sql: string, params?: unknown[]): Promise<Result>;
  // As the database owner (setup only).
  q(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  applyMigration(file: string): Promise<void>;
};

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);

  const applyMigration = async (file: string) => {
    try {
      await db.exec(stripExtensions(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8")));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  };
  for (const f of migrationFiles()) await applyMigration(f);

  const as: TestDb["as"] = async (user, sql, params = []) => {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false); set role ${user ? "authenticated" : "service_role"};`,
    );
    try {
      return { rows: (await db.query<Record<string, unknown>>(sql, params)).rows };
    } catch (e) {
      return { error: (e as Error).message };
    } finally {
      await db.exec("reset role;");
    }
  };

  const q: TestDb["q"] = async (sql, params = []) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`);
    return (await db.query<Record<string, unknown>>(sql, params)).rows;
  };

  return { db, as, q, applyMigration };
}

export const userId = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
