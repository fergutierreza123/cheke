-- Security fixes found in the pre-launch audit. Safe to run more than once.

-- 1) Anyone signed in could add THEMSELVES as owner of any business whose id
--    they knew (this policy only checked user_id, not which business or role).
--    Creating a business and joining by code already go through the
--    create_business / join_business_by_code functions, which don't need it.
drop policy if exists "users can add themselves as the first owner" on members;

-- 2) A phone's push address could be re-pointed at another business, which
--    would deliver that business's customer messages to the attacker.
drop policy if exists "own tokens update" on device_tokens;
create policy "own tokens update" on device_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_member_of(business_id));

-- 3) Signing in on a phone that was used by someone else (or by you in
--    another business) must move that phone's token to the new person. Plain
--    row-level rules can't (the row belongs to the old user), so a function
--    that checks membership does it.
create or replace function register_device_token(p_token text, p_platform text, p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not is_member_of(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Plataforma inválida';
  end if;
  insert into device_tokens (user_id, business_id, token, platform, last_seen_at)
  values (auth.uid(), p_business_id, p_token, p_platform, now())
  on conflict (token) do update
    set user_id = auth.uid(), business_id = p_business_id, platform = p_platform, last_seen_at = now();
end;
$$;

revoke all on function register_device_token(text, text, uuid) from public;
grant execute on function register_device_token(text, text, uuid) to authenticated;

-- 4) One WhatsApp number can only belong to one channel (otherwise two rows
--    for the same number make incoming messages get dropped). Skipped
--    automatically if duplicates already exist, so this never fails.
do $$
begin
  if not exists (
    select 1 from channels where external_id is not null group by type, external_id having count(*) > 1
  ) then
    create unique index if not exists channels_type_external_id_key
      on channels (type, external_id) where external_id is not null;
  end if;
end
$$;
