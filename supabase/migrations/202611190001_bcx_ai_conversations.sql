-- Account-owned BCX AI history and revocable, read-only sharing snapshots.
create table if not exists public.bcx_ai_conversations (
  id text primary key check (char_length(id) between 1 and 120),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  language text not null default 'TypeScript / Next.js' check (char_length(language) <= 80),
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bcx_ai_conversations_owner_updated_idx
  on public.bcx_ai_conversations (user_id, updated_at desc);

alter table public.bcx_ai_conversations enable row level security;

drop policy if exists "Users read own BCX conversations" on public.bcx_ai_conversations;
create policy "Users read own BCX conversations"
  on public.bcx_ai_conversations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own BCX conversations" on public.bcx_ai_conversations;
create policy "Users create own BCX conversations"
  on public.bcx_ai_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own BCX conversations" on public.bcx_ai_conversations;
create policy "Users update own BCX conversations"
  on public.bcx_ai_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own BCX conversations" on public.bcx_ai_conversations;
create policy "Users delete own BCX conversations"
  on public.bcx_ai_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.bcx_ai_conversations from anon, authenticated, service_role;
grant select, insert, update, delete on table public.bcx_ai_conversations to authenticated;

create table if not exists public.bcx_ai_shared_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  token text not null unique check (char_length(token) = 43),
  title text not null check (char_length(title) between 1 and 200),
  messages jsonb not null check (jsonb_typeof(messages) = 'array'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, conversation_id)
);

alter table public.bcx_ai_shared_conversations enable row level security;

drop policy if exists "Users read own BCX shared conversations" on public.bcx_ai_shared_conversations;
create policy "Users read own BCX shared conversations"
  on public.bcx_ai_shared_conversations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own BCX shared conversations" on public.bcx_ai_shared_conversations;
create policy "Users create own BCX shared conversations"
  on public.bcx_ai_shared_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own BCX shared conversations" on public.bcx_ai_shared_conversations;
create policy "Users update own BCX shared conversations"
  on public.bcx_ai_shared_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own BCX shared conversations" on public.bcx_ai_shared_conversations;
create policy "Users delete own BCX shared conversations"
  on public.bcx_ai_shared_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.bcx_ai_shared_conversations from anon, authenticated, service_role;
grant select, insert, update, delete on table public.bcx_ai_shared_conversations to authenticated;

create or replace function public.bcx_get_shared_conversation(p_token text)
returns table (title text, messages jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select shared.title, shared.messages, shared.created_at
  from public.bcx_ai_shared_conversations as shared
  where shared.token = p_token and shared.revoked_at is null
  limit 1
$$;

revoke all on function public.bcx_get_shared_conversation(text) from public;
grant execute on function public.bcx_get_shared_conversation(text) to anon, authenticated;

comment on table public.bcx_ai_conversations is
  'Account-owned BCX AI history. Access is restricted by owner-scoped RLS.';
comment on table public.bcx_ai_shared_conversations is
  'Owner-managed read-only conversation snapshots. Public access is only through the token lookup function.';
