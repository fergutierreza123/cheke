-- Equipo (team management). The approved design (design/Team.html) turned
-- out to be a sales leaderboard (revenue vs. monthly goal, deals closed,
-- response time per agent) — but that needs data we don't have yet
-- (per-agent monthly goals, and conversations actually being assigned to
-- specific teammates, which no screen does yet). Building the leaderboard
-- now would just show zeros for everyone.
--
-- What's genuinely useful and testable today: see who's on the team, their
-- role, and the invite code to add more people — the actual mechanics
-- CLAUDE.md's own onboarding flow already promises ("join a business with
-- an invite code"). The leaderboard is a good candidate to revisit once
-- conversation assignment exists.

-- members had no update/delete policy at all yet (RLS defaults to deny) —
-- only owners may change roles or remove teammates.
create policy "owners can update member roles" on members
  for update using (
    exists (
      select 1 from members m2
      where m2.business_id = members.business_id
        and m2.user_id = auth.uid()
        and m2.role = 'owner'
    )
  );

create policy "owners can remove members" on members
  for delete using (
    exists (
      select 1 from members m2
      where m2.business_id = members.business_id
        and m2.user_id = auth.uid()
        and m2.role = 'owner'
    )
  );

-- Regular clients can't query auth.users directly. This reads just the
-- email for members of a business the caller already belongs to (the
-- is_member_of check acts as the authorization gate — returns nothing for
-- a business the caller isn't in).
create or replace function business_members(target_business_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
security definer
stable
as $$
  select m.user_id, u.email, m.role, m.created_at
  from members m
  join auth.users u on u.id = m.user_id
  where m.business_id = target_business_id
    and is_member_of(target_business_id)
  order by m.created_at asc;
$$;

revoke all on function business_members(uuid) from public;
grant execute on function business_members(uuid) to authenticated;
