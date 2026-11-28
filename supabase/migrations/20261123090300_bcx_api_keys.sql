-- BCX API keys: server-only authentication for external applications.
create table if not exists public.bcx_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_hash text not null unique check (char_length(key_hash) = 64),
  key_prefix text not null,
  scopes text[] not null default array['memory:read']::text[],
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (scopes <@ array['memory:read']::text[]),
  check (expires_at is null or expires_at > created_at)
);
create index if not exists bcx_api_keys_user_idx on public.bcx_api_keys (user_id, created_at desc);
alter table public.bcx_api_keys enable row level security;
-- No client-readable policies: keys are managed exclusively by authenticated server routes.
revoke all on table public.bcx_api_keys from anon, authenticated;
grant select, insert, update, delete on table public.bcx_api_keys to service_role;
notify pgrst, 'reload schema';
