-- Radon Crew Desk: initial schema
-- Roles: owner (full control + team management), office (full data access), crew (own visits only), pending (no access until approved)

create extension if not exists pgcrypto;

-- ---------- team ----------
create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lead text,
  members text,
  phone text,
  color text default 'c1',
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('owner','office','crew','pending')),
  crew_id uuid references public.crews(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  company text not null default 'Your Radon Co.',
  phone text, email text, area text, cert text,
  tax_rate numeric not null default 0,
  quote_days int not null default 30,
  invoice_days int not null default 15,
  templates jsonb,
  pricebook jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ---------- customers & work ----------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text, email text, address text, city text, zip text, county text,
  foundation text, source text,
  sms_ok boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  stage text not null default 'lead' check (stage in ('lead','testing','quoted','booked','installed','complete','lost')),
  reason text,
  pre_level numeric, post_level numeric, test_method text,
  closing_date date, agent text,
  sqft int, sump text, access_notes text,
  fan text, points int, manometer text, discharge text,
  install_date date, warranty int,
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.jobs (client_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  crew_id uuid references public.crews(id) on delete set null,
  kind text not null check (kind in ('estimate','test_place','test_pickup','install','post_test','service')),
  date date not null,
  start time not null default '09:00',
  hours numeric not null default 1,
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','en_route','arrived','done','cancelled')),
  notes text,
  reminded boolean not null default false,
  result numeric, manometer text, crew_notes text,
  en_route_at timestamptz, arrived_at timestamptz, completed_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.appointments (date);
create index on public.appointments (crew_id, date);
create index on public.appointments (job_id);

create table public.billing_docs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quote','invoice')),
  number text not null unique,
  job_id uuid references public.jobs(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  quote_id uuid references public.billing_docs(id) on delete set null,
  issued date, due date,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired','unpaid','paid','void')),
  lines jsonb not null default '[]'::jsonb,
  discount numeric not null default 0,
  tax_rate numeric not null default 0,
  notes text, method text,
  sent_at timestamptz, accepted_at timestamptz, paid_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.billing_docs (job_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  channel text not null default 'sms' check (channel in ('sms','email')),
  body text not null,
  status text not null default 'recorded' check (status in ('recorded','queued','sent','delivered','failed','received')),
  read_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.messages (client_id, created_at);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  path text not null,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.photos (job_id);

-- ---------- helpers ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'pending')
$$;

create or replace function public.my_crew() returns uuid
language sql stable security definer set search_path = '' as $$
  select crew_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('owner','office') from public.profiles where id = auth.uid()), false)
$$;

-- crew can see a job/client only when one of its visits is assigned to their crew
create or replace function public.crew_can_see_job(j uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointments a
                 where a.job_id = j and a.crew_id is not null
                   and a.crew_id = (select crew_id from public.profiles where id = auth.uid()))
$$;

create or replace function public.crew_can_see_client(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.appointments a
                 where a.client_id = c and a.crew_id is not null
                   and a.crew_id = (select crew_id from public.profiles where id = auth.uid()))
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['crews','settings','clients','jobs','appointments','billing_docs'] loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- New sign-ups get a profile. The very first person becomes the owner; everyone after waits for approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when exists (select 1 from public.profiles where role = 'owner') then 'pending' else 'owner' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- crew actions (crews never write tables directly) ----------
create or replace function public.set_visit_status(p_appt uuid, p_status text, p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_appt;
  if a.id is null then raise exception 'Visit not found'; end if;
  if not (public.is_staff() or (public.my_role() = 'crew' and a.crew_id = public.my_crew())) then
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
  if not (public.is_staff() or (public.my_role() = 'crew' and a.crew_id = public.my_crew())) then
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

revoke execute on function public.set_visit_status(uuid,text,text) from anon;
revoke execute on function public.complete_visit(uuid,numeric,text,text,int,text,jsonb,text,text) from anon;

-- ---------- row level security ----------
alter table public.crews enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.clients enable row level security;
alter table public.jobs enable row level security;
alter table public.appointments enable row level security;
alter table public.billing_docs enable row level security;
alter table public.messages enable row level security;
alter table public.photos enable row level security;

-- profiles
create policy "read own or staff reads all" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy "owner manages team" on public.profiles for update to authenticated
  using ((select public.my_role()) = 'owner') with check ((select public.my_role()) = 'owner');
create policy "owner removes team" on public.profiles for delete to authenticated
  using ((select public.my_role()) = 'owner' and id <> (select auth.uid()));

-- settings & crews: everyone on the team reads, staff write
create policy "team reads settings" on public.settings for select to authenticated
  using ((select public.my_role()) in ('owner','office','crew'));
create policy "staff edit settings" on public.settings for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "team reads crews" on public.crews for select to authenticated
  using ((select public.my_role()) in ('owner','office','crew'));
create policy "staff write crews" on public.crews for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- clients / jobs: staff full, crew read-only for their assigned work
create policy "staff all clients" on public.clients for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "crew reads assigned clients" on public.clients for select to authenticated
  using ((select public.my_role()) = 'crew' and public.crew_can_see_client(id));

create policy "staff all jobs" on public.jobs for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "crew reads assigned jobs" on public.jobs for select to authenticated
  using ((select public.my_role()) = 'crew' and public.crew_can_see_job(id));

create policy "staff all appointments" on public.appointments for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "crew reads own visits" on public.appointments for select to authenticated
  using ((select public.my_role()) = 'crew' and crew_id = (select public.my_crew()));

-- billing & messages: staff only
create policy "staff all billing" on public.billing_docs for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "staff all messages" on public.messages for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- photos: staff all; crew reads and adds photos on their jobs
create policy "staff all photos" on public.photos for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "crew reads job photos" on public.photos for select to authenticated
  using ((select public.my_role()) = 'crew' and public.crew_can_see_job(job_id));
create policy "crew adds job photos" on public.photos for insert to authenticated
  with check ((select public.my_role()) = 'crew' and public.crew_can_see_job(job_id) and uploaded_by = (select auth.uid()));

-- ---------- storage for job photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 15728640, array['image/jpeg','image/png','image/heic','image/heif','image/webp'])
on conflict (id) do nothing;

create policy "team reads job photos" on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and (
    (select public.is_staff()) or
    ((select public.my_role()) = 'crew' and public.crew_can_see_job(((storage.foldername(name))[1])::uuid))));
create policy "team uploads job photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and (
    (select public.is_staff()) or
    ((select public.my_role()) = 'crew' and public.crew_can_see_job(((storage.foldername(name))[1])::uuid))));
create policy "staff deletes job photos" on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and (select public.is_staff()));

-- ---------- realtime ----------
alter publication supabase_realtime add table public.crews, public.settings, public.clients, public.jobs,
  public.appointments, public.billing_docs, public.messages, public.photos, public.profiles;
