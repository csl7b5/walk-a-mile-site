-- Campaign settings: the current quarter window plus the manual open/close switches
-- for submissions and voting. Single row, edited from the admin dashboard each quarter.

-- Quarter boundaries are wall-clock dates to the people running the campaign, so
-- they are anchored to Yale's timezone rather than the database's UTC. Defaulting
-- to date_trunc('quarter', now()) would store 1 July 00:00 UTC, which is 30 June
-- in New Haven, and the admin dashboard would show the quarter starting a day early.

create table if not exists public.campaign_settings (
  id integer primary key default 1 check (id = 1),
  quarter_label text not null
    default to_char(now() at time zone 'America/New_York', '"Q"Q YYYY'),
  quarter_starts_at timestamptz not null
    default (date_trunc('quarter', now() at time zone 'America/New_York') at time zone 'America/New_York'),
  quarter_ends_at timestamptz not null
    default ((date_trunc('quarter', now() at time zone 'America/New_York') + interval '3 months' - interval '1 millisecond') at time zone 'America/New_York'),
  submissions_open boolean not null default false,
  voting_open boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint campaign_settings_quarter_order check (quarter_ends_at > quarter_starts_at)
);

-- Applied separately so re-running this migration corrects a table created before
-- the timezone fix.
alter table public.campaign_settings
  alter column quarter_label set default to_char(now() at time zone 'America/New_York', '"Q"Q YYYY'),
  alter column quarter_starts_at set default (date_trunc('quarter', now() at time zone 'America/New_York') at time zone 'America/New_York'),
  alter column quarter_ends_at set default ((date_trunc('quarter', now() at time zone 'America/New_York') + interval '3 months' - interval '1 millisecond') at time zone 'America/New_York');

insert into public.campaign_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.touch_campaign_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end;
$$;

drop trigger if exists campaign_settings_touch on public.campaign_settings;
create trigger campaign_settings_touch
  before update on public.campaign_settings
  for each row execute function public.touch_campaign_settings();

-- ── RLS ────────────────────────────────────────────────────
-- The public site reads these flags to decide what to render; only admins change them.

alter table public.campaign_settings enable row level security;

drop policy if exists "campaign_settings_select" on public.campaign_settings;
create policy "campaign_settings_select"
  on public.campaign_settings
  for select
  using (true);

drop policy if exists "campaign_settings_update" on public.campaign_settings;
create policy "campaign_settings_update"
  on public.campaign_settings
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ── Helpers ────────────────────────────────────────────────

create or replace function public.campaign_submissions_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select submissions_open from public.campaign_settings where id = 1), false);
$$;

create or replace function public.campaign_voting_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select voting_open from public.campaign_settings where id = 1), false);
$$;

grant execute on function public.campaign_submissions_open() to anon, authenticated;
grant execute on function public.campaign_voting_open() to anon, authenticated;

-- ── Enforce the submission window in the database ──────────
-- Hiding the form in the UI is not enough: the anon key is public, so anyone can
-- POST directly to the REST API. The gate has to live in the insert policy.

drop policy if exists "submissions_insert" on public.submissions;
create policy "submissions_insert"
  on public.submissions
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and doc ? 'type'
    and (doc->>'type') in ('conv', 'myst')
    and public.campaign_submissions_open()
  );
