-- Pending (and rejected) submissions are not visible to the public API.
-- Only featured + archived are readable anonymously; campaign admins still see all when signed in.

drop policy if exists "submissions_select" on public.submissions;
create policy "submissions_select"
  on public.submissions
  for select
  using (
    status in ('featured', 'archived')
    or (
      (auth.jwt()->>'email') is not null
      and exists (
        select 1 from public.app_admins a
        where a.email = (auth.jwt()->>'email')
      )
    )
  );
