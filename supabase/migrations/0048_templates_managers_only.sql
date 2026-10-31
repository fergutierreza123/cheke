-- Founder decision (28 oct): only Dueños and Gerentes create, edit or delete
-- Plantillas, like Respuestas rápidas (0024). Everyone still reads and uses
-- them. Re-runnable.

drop policy if exists "tenant write" on templates;
drop policy if exists "tenant update" on templates;
drop policy if exists "tenant delete" on templates;

drop policy if exists "managers write" on templates;
create policy "managers write" on templates for insert with check (can_manage_templates(business_id));
drop policy if exists "managers update" on templates;
create policy "managers update" on templates for update
  using (can_manage_templates(business_id)) with check (can_manage_templates(business_id));
drop policy if exists "managers delete" on templates;
create policy "managers delete" on templates for delete using (can_manage_templates(business_id));
