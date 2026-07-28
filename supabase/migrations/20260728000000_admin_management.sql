-- Admin management: case-insensitive admin check, self-serve allowlist, seeded admins.
--
-- Background: the sign-in gate compared emails case-insensitively while every write
-- policy compared them exactly. An admin whose Auth email had different casing than
-- their app_admins row could sign in and then have every action silently rejected.
-- public.is_app_admin() is now the single definition used everywhere.

-- ── Admin identity helper ──────────────────────────────────

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(auth.jwt() ->> 'email', '') <> ''
  );
$$;

grant execute on function public.is_app_admin() to anon, authenticated;

-- ── app_admins: richer roster for the admin UI ─────────────

alter table public.app_admins add column if not exists display_name text;
alter table public.app_admins add column if not exists added_by text;

-- Normalize any pre-existing rows so lookups and unique-by-email hold.
update public.app_admins set email = lower(email) where email <> lower(email);

create unique index if not exists app_admins_email_lower_idx on public.app_admins (lower(email));

-- ── app_admins policies ────────────────────────────────────
-- Admins manage the roster from the dashboard; everyone else can only confirm
-- their own row exists (which is what the sign-in gate needs).

drop policy if exists "app_admins_read_own" on public.app_admins;
drop policy if exists "app_admins_select" on public.app_admins;
create policy "app_admins_select"
  on public.app_admins
  for select
  to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_app_admin()
  );

drop policy if exists "app_admins_insert" on public.app_admins;
create policy "app_admins_insert"
  on public.app_admins
  for insert
  to authenticated
  with check (public.is_app_admin());

drop policy if exists "app_admins_delete" on public.app_admins;
create policy "app_admins_delete"
  on public.app_admins
  for delete
  to authenticated
  using (
    public.is_app_admin()
    -- Removing yourself would lock you out mid-session; do it from another account.
    and lower(email) <> lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ── Safety net: never empty the roster ─────────────────────
-- Without at least one admin nobody can sign in to add one back, and recovery
-- requires the Supabase SQL editor.

create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.app_admins) <= 1 then
    raise exception 'Cannot remove the last administrator. Add another admin first.';
  end if;
  return old;
end;
$$;

drop trigger if exists app_admins_prevent_last_removal on public.app_admins;
create trigger app_admins_prevent_last_removal
  before delete on public.app_admins
  for each row execute function public.prevent_last_admin_removal();

-- ── Keep submissions write access on the shared helper ─────

drop policy if exists "submissions_update_admin" on public.submissions;
create policy "submissions_update_admin"
  on public.submissions
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "submissions_delete_admin" on public.submissions;
create policy "submissions_delete_admin"
  on public.submissions
  for delete
  to authenticated
  using (public.is_app_admin());

-- ── Seed campaign administrators ───────────────────────────
-- IMPORTANT: these follow the firstname.lastname@yale.edu convention. Verify each
-- address matches the person's real Yale account before launch — an allowlist row
-- only grants access once a matching Supabase Auth user exists (Authentication →
-- Users → Invite). Wrong address here just means the invite never lines up.

insert into public.app_admins (email, display_name, added_by) values
  ('lucy.nemcheck@yale.edu',    'Lucy Nemcheck',    'seed migration'),
  ('isabella.palma@yale.edu',   'Isabella Palma',   'seed migration'),
  ('lindsie.boerger@yale.edu',  'Lindsie Boerger',  'seed migration')
on conflict (email) do update
  set display_name = coalesce(app_admins.display_name, excluded.display_name);
