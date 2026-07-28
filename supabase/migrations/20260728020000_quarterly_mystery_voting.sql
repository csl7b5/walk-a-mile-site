-- Quarter-scoped Mystery Mile voting.
--
-- Two problems solved here:
--
-- 1. The ballot listed every conventional miler ever submitted, so the actual
--    mystery miler was often not even an option. It now lists the mystery milers
--    who submitted during the current quarter.
--
-- 2. The answer was readable straight from the API. The featured mystery row was
--    publicly selectable and its doc carried the submitter's real name, so anyone
--    could read it from the browser network tab. The live mystery is no longer
--    publicly selectable at all; it is served through a function that returns only
--    the clues, the photo, and an opaque public_ref instead of its row id.
--
-- The ballot deliberately exposes real submission ids for the candidates. That is
-- safe only because nothing public ever links the active mystery back to its row id:
-- get_active_mystery() hands out public_ref, and mystery_votes is admin-only.

-- ── Opaque public handle for the active mystery ────────────

alter table public.submissions add column if not exists public_ref uuid not null default gen_random_uuid();
create unique index if not exists submissions_public_ref_idx on public.submissions (public_ref);

-- ── Public read access ─────────────────────────────────────
-- Conventional stories are meant to be public once published. Mystery entries are
-- public only after they have been revealed (archived). The live one stays hidden.

drop policy if exists "submissions_select" on public.submissions;
create policy "submissions_select"
  on public.submissions
  for select
  using (
    public.is_app_admin()
    or ((doc->>'type') = 'conv' and status in ('featured', 'archived'))
    or ((doc->>'type') = 'myst' and status = 'archived')
  );

-- ── Votes are no longer publicly readable ──────────────────
-- A public read exposed mystery_submission_id, which is the very row id the ballot
-- would let you resolve to a name. Tallies now come from get_mystery_votes().

drop policy if exists "mystery_votes_select" on public.mystery_votes;
create policy "mystery_votes_select"
  on public.mystery_votes
  for select
  to authenticated
  using (public.is_app_admin());

drop policy if exists "mystery_votes_insert" on public.mystery_votes;
drop policy if exists "mystery_votes_update" on public.mystery_votes;

-- ── The live mystery, with identity stripped ───────────────

create or replace function public.get_active_mystery()
returns table (
  ref uuid,
  prompt_set integer,
  prompt_questions jsonb,
  answers jsonb,
  photo text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.public_ref,
    nullif(s.doc->>'promptSet', '')::integer,
    coalesce(s.doc->'promptQuestions', '[]'::jsonb),
    coalesce(s.doc->'answers', '[]'::jsonb),
    s.doc->>'photo',
    s.submitted_at
  from public.submissions s
  where s.doc->>'type' = 'myst'
    and s.status = 'featured'
  order by s.submitted_at desc
  limit 1;
$$;

-- ── This quarter's candidates ──────────────────────────────
-- Everyone who submitted a mystery entry inside the current quarter window, plus
-- the active mystery itself as a safety net in case an admin features an entry
-- carried over from a previous quarter (otherwise the answer could not be picked).
-- Ordered by a per-quarter hash so position leaks nothing.

create or replace function public.get_mystery_ballot()
returns table (
  id uuid,
  name text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.name, b.role
  from (
    select
      s.id,
      coalesce(nullif(trim(s.doc->>'name'), ''), 'Anonymous') as name,
      coalesce(nullif(trim(s.doc->>'role'), ''), 'Colleague') as role,
      md5(s.id::text || coalesce(c.quarter_label, '')) as shuffle
    from public.submissions s
    cross join public.campaign_settings c
    where c.id = 1
      and s.doc->>'type' = 'myst'
      and s.status <> 'rejected'
      and (
        (s.submitted_at >= c.quarter_starts_at and s.submitted_at < c.quarter_ends_at)
        or s.status = 'featured'
      )
  ) b
  order by b.shuffle;
$$;

-- ── Tally + this voter's current pick ──────────────────────

create or replace function public.get_mystery_votes(p_ref uuid, p_voter_key text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select s.id
    from public.submissions s
    where s.public_ref = p_ref
      and s.doc->>'type' = 'myst'
      and s.status = 'featured'
  )
  select jsonb_build_object(
    'tally', coalesce((
      select jsonb_object_agg(t.choice_submission_id, t.n)
      from (
        select v.choice_submission_id, count(*) as n
        from public.mystery_votes v
        join m on v.mystery_submission_id = m.id
        group by v.choice_submission_id
      ) t
    ), '{}'::jsonb),
    'total', coalesce((
      select count(*) from public.mystery_votes v join m on v.mystery_submission_id = m.id
    ), 0),
    'current_vote', (
      select v.choice_submission_id
      from public.mystery_votes v
      join m on v.mystery_submission_id = m.id
      where p_voter_key is not null and v.voter_key = p_voter_key
      limit 1
    )
  );
$$;

-- ── Casting a vote ─────────────────────────────────────────
-- Enforces the voting window, resolves the opaque ref server-side, and rejects
-- choices that are not on this quarter's ballot.

create or replace function public.cast_mystery_vote(p_ref uuid, p_choice uuid, p_voter_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_mystery uuid;
begin
  if not public.campaign_voting_open() then
    raise exception 'Voting is closed right now. Check back when the next round opens.';
  end if;

  if p_voter_key is null or length(p_voter_key) < 8 then
    raise exception 'Could not identify your browser session. Enable cookies and try again.';
  end if;

  select s.id into v_mystery
  from public.submissions s
  where s.public_ref = p_ref
    and s.doc->>'type' = 'myst'
    and s.status = 'featured';

  if v_mystery is null then
    raise exception 'There is no active Mystery Mile to vote on.';
  end if;

  if not exists (select 1 from public.get_mystery_ballot() b where b.id = p_choice) then
    raise exception 'That name is not on this quarter''s ballot.';
  end if;

  insert into public.mystery_votes (mystery_submission_id, choice_submission_id, voter_key)
  values (v_mystery, p_choice, p_voter_key)
  on conflict (mystery_submission_id, voter_key)
    do update set choice_submission_id = excluded.choice_submission_id;

  return public.get_mystery_votes(p_ref, p_voter_key);
end;
$$;

grant execute on function public.get_active_mystery() to anon, authenticated;
grant execute on function public.get_mystery_ballot() to anon, authenticated;
grant execute on function public.get_mystery_votes(uuid, text) to anon, authenticated;
grant execute on function public.cast_mystery_vote(uuid, uuid, text) to anon, authenticated;
