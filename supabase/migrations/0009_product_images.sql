-- Storage bucket for product photos (Catálogo). Public so the images can be
-- shown in Chat and eventually sent over WhatsApp, which needs a public URL.
-- Writes are still scoped per business via RLS below — only members of a
-- business can upload/replace/delete files under that business's own
-- folder (object path is `${business_id}/...`).

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "tenant upload product images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and is_member_of((storage.foldername(name))[1]::uuid)
);

create policy "tenant update product images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and is_member_of((storage.foldername(name))[1]::uuid)
);

create policy "tenant delete product images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and is_member_of((storage.foldername(name))[1]::uuid)
);
