-- Walk a Mile: core schema, RLS, storage bucket mile-photos

create extension if not exists "pgcrypto";

-- ── Tables ─────────────────────────────────────────────────

create table if not exists public.app_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'featured', 'archived', 'rejected')),
  doc jsonb not null
    check (octet_length(doc::text) < 600000),
  constraint submissions_doc_type check ((doc->>'type') in ('conv', 'myst'))
);

-- If `submissions` already existed from an older/partial schema, CREATE TABLE was skipped
-- but the index below still needs this column.
alter table public.submissions
  add column if not exists submitted_at timestamptz not null default now();

create index if not exists submissions_submitted_at_idx on public.submissions (submitted_at desc);
create index if not exists submissions_status_idx on public.submissions (status);

create table if not exists public.mystery_votes (
  id uuid primary key default gen_random_uuid(),
  mystery_submission_id uuid not null references public.submissions (id) on delete cascade,
  choice_submission_id uuid not null references public.submissions (id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (mystery_submission_id, voter_key)
);

create index if not exists mystery_votes_mystery_idx on public.mystery_votes (mystery_submission_id);

-- ── RLS ────────────────────────────────────────────────────

alter table public.app_admins enable row level security;
alter table public.submissions enable row level security;
alter table public.mystery_votes enable row level security;

-- App admins: read own row (exact email match to JWT — case-insensitive variant in follow-up migration)
drop policy if exists "app_admins_read_own" on public.app_admins;
create policy "app_admins_read_own"
  on public.app_admins
  for select
  to authenticated
  using (email = (auth.jwt()->>'email'));

-- Submissions: public sees non-rejected; admins see all
drop policy if exists "submissions_select" on public.submissions;
create policy "submissions_select"
  on public.submissions
  for select
  using (
    status <> 'rejected'
    or (
      (auth.jwt()->>'email') is not null
      and exists (
        select 1 from public.app_admins a
        where a.email = (auth.jwt()->>'email')
      )
    )
  );

-- New submissions: anon or authenticated, pending only
drop policy if exists "submissions_insert" on public.submissions;
create policy "submissions_insert"
  on public.submissions
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and doc ? 'type'
    and (doc->>'type') in ('conv', 'myst')
  );

-- Updates: campaign admins only (exact email match — align Auth sign-up email with app_admins)
drop policy if exists "submissions_update_admin" on public.submissions;
create policy "submissions_update_admin"
  on public.submissions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.app_admins a
      where a.email = (auth.jwt()->>'email')
    )
  )
  with check (
    exists (
      select 1 from public.app_admins a
      where a.email = (auth.jwt()->>'email')
    )
  );

-- Mystery votes: read tallies publicly; insert/update for voting (anon session + voter_key)
drop policy if exists "mystery_votes_select" on public.mystery_votes;
create policy "mystery_votes_select"
  on public.mystery_votes
  for select
  using (true);

drop policy if exists "mystery_votes_insert" on public.mystery_votes;
create policy "mystery_votes_insert"
  on public.mystery_votes
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "mystery_votes_update" on public.mystery_votes;
create policy "mystery_votes_update"
  on public.mystery_votes
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- ── Storage: mile-photos ─────────────────────────────────

insert into storage.buckets (id, name, public)
values ('mile-photos', 'mile-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "mile_photos_public_read" on storage.objects;
create policy "mile_photos_public_read"
  on storage.objects
  for select
  using (bucket_id = 'mile-photos');

drop policy if exists "mile_photos_anon_insert" on storage.objects;
create policy "mile_photos_anon_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'mile-photos');

drop policy if exists "mile_photos_anon_update" on storage.objects;
create policy "mile_photos_anon_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'mile-photos')
  with check (bucket_id = 'mile-photos');
