-- Demo Negocio for Apple / Google app reviewers ("Acceso para revisores" on
-- the login screen). Safe to run more than once.
--
-- `is_demo` marks the one Negocio the reviewer account signs into. For that
-- Negocio cheKe works in "modo prueba": messages are saved in cheKe but
-- never sent to WhatsApp, so a reviewer can't message a real person. The
-- server only ever creates, seeds or refreshes the row with is_demo = true;
-- real Negocios are never touched.
--
-- Nobody can flip this flag from the app: `businesses` has no UPDATE policy
-- for signed-in users (see 0001_init.sql), only the server's service key.

alter table businesses
  add column if not exists is_demo boolean not null default false;

-- At most one demo Negocio, so the server can always find "the" demo.
create unique index if not exists businesses_single_demo
  on businesses (is_demo) where is_demo;
