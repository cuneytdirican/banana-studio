-- Append-only workspace audit trail. Only the service role writes; owners and
-- administrators can read. The table is deliberately not exposed for update or
-- delete from the browser.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text check (target_type is null or char_length(target_type) <= 40),
  target_id text check (target_id is null or char_length(target_id) <= 200),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_at_idx on public.audit_events (created_at desc);
create index if not exists audit_events_user_created_idx on public.audit_events (user_id, created_at desc);

alter table public.audit_events enable row level security;

drop policy if exists "audit_events_select_own_or_admin" on public.audit_events;
create policy "audit_events_select_own_or_admin"
  on public.audit_events for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- No insert/update/delete policy: writes go through the server-side service
-- role after requireUser() and input validation.
