-- QA round 2: only Dueños can delete a Contacto.
--
-- A Contacto is shared by every Tienda of the Negocio, and deleting one
-- also deletes (on delete cascade) all of its conversations, messages and
-- orders, in every Tienda. Since 0001 any member could do it straight
-- through the API, so an Agente of one Tienda could erase another Tienda's
-- chats they can't even see. The app itself never deletes contacts; this
-- keeps the door closed for everyone except Dueños, who see every Tienda.
--
-- Safe to run more than once.

drop policy if exists "tenant delete" on contacts;
drop policy if exists "owners delete" on contacts;
create policy "owners delete" on contacts for delete using (is_owner_of(business_id));
