-- Returns a reserved slot when the job was not actually admitted (queue full,
-- duplicate, session mismatch or an enqueue RPC failure).
create or replace function public.release_generation_quota()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
begin
  if v_user is null then
    return;
  end if;
  update public.generation_quota
    set used = greatest(used - 1, 0)
    where user_id = v_user and day = v_day;
end;
$$;

revoke all on function public.release_generation_quota() from public;
revoke all on function public.release_generation_quota() from anon;
revoke all on function public.release_generation_quota() from authenticated;
grant execute on function public.release_generation_quota() to service_role;
