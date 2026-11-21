-- BCX Permanent Memory Engine 2.0: idempotent automatic capture.
-- Existing user memories are preserved; fingerprint is nullable for legacy rows.
alter table public.bcx_ai_memories
  add column if not exists fingerprint text;

create unique index if not exists bcx_ai_memories_user_fingerprint_uidx
  on public.bcx_ai_memories (user_id, fingerprint)
  where fingerprint is not null;

create or replace function public.bcx_set_ai_conversation_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bcx_ai_conversations_updated_at on public.bcx_ai_conversations;
create trigger bcx_ai_conversations_updated_at
before update on public.bcx_ai_conversations
for each row execute function public.bcx_set_ai_conversation_updated_at();

notify pgrst, 'reload schema';
