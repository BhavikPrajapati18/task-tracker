-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New query.
-- This application is private by default: only allowlisted authenticated users may read it.
-- The public/publishable API key is safe in the browser ONLY because RLS protects all tables.

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'waiting_approval', 'completed')),
  due_date date,
  estimated_hours numeric(6,2) check (estimated_hours is null or estimated_hours >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_status_priority on public.tasks(status, priority);
create index if not exists idx_tasks_due_date on public.tasks(due_date);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at before update on public.projects
for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at before update on public.tasks
for each row execute function public.touch_updated_at();

-- SECURITY DEFINER helper functions avoid recursive user_roles RLS checks.
create or replace function public.is_tracker_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()));
$$;

create or replace function public.is_tracker_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin');
$$;

revoke all on function public.is_tracker_member() from public;
revoke all on function public.is_tracker_admin() from public;
grant execute on function public.is_tracker_member() to authenticated;
grant execute on function public.is_tracker_admin() to authenticated;

alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

-- Explicit table grants; PostgreSQL RLS still determines which rows each user sees.
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.projects, public.tasks to authenticated;
revoke all on public.user_roles, public.projects, public.tasks from anon;

-- Users can see only their own role. Role grants are done by admin in SQL editor.
drop policy if exists "Read my own role" on public.user_roles;
create policy "Read my own role" on public.user_roles
for select to authenticated using (user_id = (select auth.uid()));

-- Only allowlisted users may read; admins may write.
drop policy if exists "Members can read projects" on public.projects;
create policy "Members can read projects" on public.projects
for select to authenticated using ((select public.is_tracker_member()));

drop policy if exists "Admins can create projects" on public.projects;
create policy "Admins can create projects" on public.projects
for insert to authenticated with check ((select public.is_tracker_admin()));

drop policy if exists "Admins can update projects" on public.projects;
create policy "Admins can update projects" on public.projects
for update to authenticated using ((select public.is_tracker_admin())) with check ((select public.is_tracker_admin()));

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Admins can delete projects" on public.projects
for delete to authenticated using ((select public.is_tracker_admin()));

drop policy if exists "Members can read tasks" on public.tasks;
create policy "Members can read tasks" on public.tasks
for select to authenticated using ((select public.is_tracker_member()));

drop policy if exists "Admins can create tasks" on public.tasks;
create policy "Admins can create tasks" on public.tasks
for insert to authenticated with check ((select public.is_tracker_admin()));

drop policy if exists "Admins can update tasks" on public.tasks;
create policy "Admins can update tasks" on public.tasks
for update to authenticated using ((select public.is_tracker_admin())) with check ((select public.is_tracker_admin()));

drop policy if exists "Admins can delete tasks" on public.tasks;
create policy "Admins can delete tasks" on public.tasks
for delete to authenticated using ((select public.is_tracker_admin()));

-- Allow authenticated clients to receive change notifications (RLS applies).
do $$
begin
  begin
    alter publication supabase_realtime add table public.projects;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
end $$;
