-- BCX capability foundation: user-controlled memory, feedback and usage telemetry.
-- Apply manually in Supabase SQL Editor after reviewing project policies.

create table if not exists public.bcx_ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 6000),
  category text not null default 'general' check (char_length(category) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bcx_ai_memories_user_updated_idx
  on public.bcx_ai_memories (user_id, updated_at desc);

alter table public.bcx_ai_memories enable row level security;
drop policy if exists "Users manage own BCX memories" on public.bcx_ai_memories;
create policy "Users manage own BCX memories"
  on public.bcx_ai_memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.bcx_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text,
  rating smallint not null check (rating in (-1, 1)),
  category text not null default 'general' check (char_length(category) <= 60),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists bcx_ai_feedback_user_created_idx
  on public.bcx_ai_feedback (user_id, created_at desc);

alter table public.bcx_ai_feedback enable row level security;
drop policy if exists "Users read own BCX feedback" on public.bcx_ai_feedback;
create policy "Users read own BCX feedback"
  on public.bcx_ai_feedback for select
  using (auth.uid() = user_id);
drop policy if exists "Users submit own BCX feedback" on public.bcx_ai_feedback;
create policy "Users submit own BCX feedback"
  on public.bcx_ai_feedback for insert
  with check (auth.uid() = user_id);

create table if not exists public.bcx_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  capability text not null check (char_length(capability) <= 80),
  provider text not null check (char_length(provider) <= 80),
  outcome text not null check (outcome in ('success', 'error', 'blocked')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists bcx_ai_usage_events_created_idx
  on public.bcx_ai_usage_events (created_at desc);
alter table public.bcx_ai_usage_events enable row level security;
-- Deliberately no client write/read policy for usage events: telemetry writes must be added
-- through a server-side, authenticated, rate-limited path only.
