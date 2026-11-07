-- Persistent, owner-isolated workspaces for BCX Cloud IDE.
create table if not exists public.bcx_ide_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Mon projet BCX' check (char_length(name) between 1 and 120),
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bcx_ide_workspaces_owner_updated_idx
  on public.bcx_ide_workspaces (user_id, updated_at desc);

alter table public.bcx_ide_workspaces enable row level security;

drop policy if exists "Users read own IDE workspaces" on public.bcx_ide_workspaces;
create policy "Users read own IDE workspaces"
  on public.bcx_ide_workspaces for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own IDE workspaces" on public.bcx_ide_workspaces;
create policy "Users create own IDE workspaces"
  on public.bcx_ide_workspaces for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own IDE workspaces" on public.bcx_ide_workspaces;
create policy "Users update own IDE workspaces"
  on public.bcx_ide_workspaces for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own IDE workspaces" on public.bcx_ide_workspaces;
create policy "Users delete own IDE workspaces"
  on public.bcx_ide_workspaces for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.bcx_ide_workspaces is
  'User-owned BCX IDE projects. File contents are JSON metadata/content and are protected by owner-scoped RLS.';
