-- Case-insensitive self-read for app_admins (JWT email vs stored row)
-- Note: submissions admin policies still use exact app_admins.email = auth.jwt() email.

drop policy if exists "app_admins_read_own" on public.app_admins;

create policy "app_admins_read_own"
  on public.app_admins
  for select
  to authenticated
  using (lower(email) = lower(auth.jwt()->>'email'));
