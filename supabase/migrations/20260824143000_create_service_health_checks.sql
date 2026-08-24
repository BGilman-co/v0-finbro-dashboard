create table if not exists public.service_health_checks (
  id uuid primary key default gen_random_uuid(),
  check_name text not null,
  checked_at timestamptz not null default now(),
  check_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_health_checks_check_name_key unique (check_name),
  constraint service_health_checks_check_count_positive_check check (check_count > 0)
);

alter table public.service_health_checks enable row level security;

revoke all on public.service_health_checks from anon;
revoke all on public.service_health_checks from authenticated;
grant select, insert, update, delete on public.service_health_checks to service_role;

create policy service_health_checks_select_service_role
  on public.service_health_checks
  for select
  to service_role
  using (true);

create policy service_health_checks_insert_service_role
  on public.service_health_checks
  for insert
  to service_role
  with check (true);

create policy service_health_checks_update_service_role
  on public.service_health_checks
  for update
  to service_role
  using (true)
  with check (true);

create policy service_health_checks_delete_service_role
  on public.service_health_checks
  for delete
  to service_role
  using (true);

create or replace function public.record_service_health_check(target_check_name text)
returns table (
  check_name text,
  checked_at timestamptz,
  check_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with upserted_health_check as (
    insert into public.service_health_checks as health_checks (check_name)
    values (target_check_name)
    on conflict on constraint service_health_checks_check_name_key
    do update set
      checked_at = now(),
      updated_at = now(),
      check_count = health_checks.check_count + 1
    returning
      health_checks.check_name,
      health_checks.checked_at,
      health_checks.check_count
  )
  select
    upserted_health_check.check_name,
    upserted_health_check.checked_at,
    upserted_health_check.check_count
  from upserted_health_check;
end;
$$;

revoke all on function public.record_service_health_check(text) from public;
grant execute on function public.record_service_health_check(text) to service_role;
