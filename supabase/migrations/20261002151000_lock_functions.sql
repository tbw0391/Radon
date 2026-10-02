-- Move internal helpers out of the exposed API schema and stop signed-out visitors calling anything.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_role() set schema private;
alter function public.my_crew() set schema private;
alter function public.is_staff() set schema private;
alter function public.crew_can_see_job(uuid) set schema private;
alter function public.crew_can_see_client(uuid) set schema private;
alter function public.handle_new_user() set schema private;

revoke all on function private.my_role(), private.my_crew(), private.is_staff(),
  private.crew_can_see_job(uuid), private.crew_can_see_client(uuid), private.handle_new_user() from public, anon;
grant execute on function private.my_role(), private.my_crew(), private.is_staff(),
  private.crew_can_see_job(uuid), private.crew_can_see_client(uuid) to authenticated;
revoke all on function private.handle_new_user() from authenticated;

-- the two crew actions reference the helpers by name, so point them at the new schema
create or replace function public.set_visit_status(p_appt uuid, p_status text, p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_appt;
  if a.id is null then raise exception 'Visit not found'; end if;
  if not (private.is_staff() or (private.my_role() = 'crew' and a.crew_id = private.my_crew())) then
    raise exception 'Not allowed';
  end if;
  if p_status not in ('en_route','arrived') then raise exception 'Use complete_visit to finish a visit'; end if;
  update public.appointments set status = p_status,
    en_route_at = case when p_status = 'en_route' then now() else en_route_at end,
    arrived_at  = case when p_status = 'arrived'  then now() else arrived_at  end
  where id = p_appt;
  if p_message is not null and length(trim(p_message)) > 0 then
    insert into public.messages (client_id, direction, channel, body, created_by)
    values (a.client_id, 'out', 'sms', p_message, auth.uid());
  end if;
end $$;

create or replace function public.complete_visit(
  p_appt uuid, p_result numeric default null, p_manometer text default null, p_fan text default null,
  p_points int default null, p_discharge text default null, p_checklist jsonb default null,
  p_notes text default null, p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments; j public.jobs;
begin
  select * into a from public.appointments where id = p_appt;
  if a.id is null then raise exception 'Visit not found'; end if;
  if not (private.is_staff() or (private.my_role() = 'crew' and a.crew_id = private.my_crew())) then
    raise exception 'Not allowed';
  end if;
  update public.appointments set status = 'done', completed_at = now(), result = p_result,
    manometer = p_manometer, crew_notes = p_notes where id = p_appt;
  select * into j from public.jobs where id = a.job_id;
  if a.kind = 'test_pickup' and p_result is not null then
    update public.jobs set pre_level = p_result,
      stage = case when stage in ('lead','testing') then 'testing' else stage end where id = j.id;
  elsif a.kind = 'install' then
    update public.jobs set stage = 'installed', install_date = a.date,
      manometer = coalesce(p_manometer, manometer), fan = coalesce(nullif(p_fan,''), fan),
      points = coalesce(p_points, points), discharge = coalesce(nullif(p_discharge,''), discharge),
      checklist = coalesce(checklist, '{}'::jsonb) || coalesce(p_checklist, '{}'::jsonb) where id = j.id;
  elsif a.kind = 'post_test' and p_result is not null then
    update public.jobs set post_level = p_result,
      stage = case when p_result < 4 then 'complete' else stage end where id = j.id;
  end if;
  if p_notes is not null and length(trim(p_notes)) > 0 then
    update public.jobs set notes = trim(coalesce(notes,'') || E'\n[' || to_char(a.date,'Mon DD') || ' crew] ' || p_notes) where id = j.id;
  end if;
  if p_message is not null and length(trim(p_message)) > 0 then
    insert into public.messages (client_id, direction, channel, body, created_by)
    values (a.client_id, 'out', 'sms', p_message, auth.uid());
  end if;
end $$;

revoke all on function public.set_visit_status(uuid,text,text) from public, anon;
revoke all on function public.complete_visit(uuid,numeric,text,text,int,text,jsonb,text,text) from public, anon;
grant execute on function public.set_visit_status(uuid,text,text) to authenticated;
grant execute on function public.complete_visit(uuid,numeric,text,text,int,text,jsonb,text,text) to authenticated;
