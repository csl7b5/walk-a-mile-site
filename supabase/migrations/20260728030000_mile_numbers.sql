-- Assign Mile numbers server-side, at publication time.
--
-- The client derived mileNumber from the number of conventional stories it could
-- see. Since pending stories are not publicly readable, that count is the number of
-- *published* stories, so every submission received between two publishes was
-- stamped with the same Mile number.
--
-- Numbering on publish rather than on submit keeps the series contiguous: drafts
-- that are rejected never consume a number, and a submission blocked by the closed
-- form does not leave a hole. "Mile #1" is the first story the department saw.

create sequence if not exists public.mile_number_seq;

-- Continue from whatever the highest existing number is (is_called = false so the
-- next call returns this value rather than skipping it).
select setval(
  'public.mile_number_seq',
  coalesce((select max(nullif(doc->>'mileNumber', '')::bigint) from public.submissions where doc->>'type' = 'conv'), 0) + 1,
  false
);

create or replace function public.assign_mile_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.doc->>'type' = 'conv'
     and new.status in ('featured', 'archived')
     and coalesce(nullif(new.doc->>'mileNumber', ''), '') = ''
  then
    new.doc := jsonb_set(new.doc, '{mileNumber}', to_jsonb(nextval('public.mile_number_seq')));
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_assign_mile_number on public.submissions;
create trigger submissions_assign_mile_number
  before insert or update on public.submissions
  for each row execute function public.assign_mile_number();
