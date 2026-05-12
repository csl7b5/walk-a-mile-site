-- Fix: older or partial `public.submissions` tables may lack `submitted_at`
-- (CREATE TABLE IF NOT EXISTS skips when the table already exists, then the index on submitted_at fails.)

alter table public.submissions
  add column if not exists submitted_at timestamptz not null default now();

create index if not exists submissions_submitted_at_idx on public.submissions (submitted_at desc);
