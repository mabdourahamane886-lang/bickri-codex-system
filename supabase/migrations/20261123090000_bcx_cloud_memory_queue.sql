create extension if not exists pg_cron with schema pg_catalog;

create table public.bcx_memory_queue (
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  content text not null check (char_length(content) between 12 and 900),
  category text not null check (category in ('explicit', 'preferences', 'projects')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  primary key (user_id, fingerprint)
);

create index bcx_memory_queue_due_idx on public.bcx_memory_queue (available_at);
alter table public.bcx_memory_queue enable row level security;
revoke all on public.bcx_memory_queue from public, anon, authenticated;

create function public.bcx_enqueue_memory(memory_content text, memory_category text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  memory_hash text;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if memory_content is null or char_length(memory_content) not between 12 and 900
     or memory_category is null or memory_category not in ('explicit', 'preferences', 'projects')
     or memory_content ~* '(password|mot de passe|\mmdp\M|secret|api[_ -]?key|clé privée|private key|token|[[:digit:]]{8,}|@)' then
    raise exception 'Invalid memory candidate' using errcode = '22023';
  end if;

  memory_hash := pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(memory_category || ':' || pg_catalog.lower(memory_content), 'UTF8')
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  if exists (
    select 1 from public.bcx_ai_memories where user_id = owner_id and fingerprint = memory_hash
  ) or exists (
    select 1 from public.bcx_memory_queue where user_id = owner_id and fingerprint = memory_hash
  ) then
    return;
  end if;

  if (select count(*) from public.bcx_memory_queue where user_id = owner_id) >= 100 then
    raise exception 'Memory queue is full' using errcode = '54000';
  end if;

  insert into public.bcx_memory_queue (user_id, fingerprint, content, category)
  values (owner_id, memory_hash, memory_content, memory_category)
  on conflict do nothing;
end;
$$;

revoke execute on function public.bcx_enqueue_memory(text, text) from public, anon, authenticated;
grant execute on function public.bcx_enqueue_memory(text, text) to authenticated;

create function public.bcx_process_memory_queue()
returns integer language plpgsql set search_path = '' as $$
declare
  job public.bcx_memory_queue%rowtype;
  processed integer := 0;
begin
  for job in
    select * from public.bcx_memory_queue
    where available_at <= now()
    order by available_at, user_id, fingerprint
    limit 100
    for update skip locked
  loop
    begin
      insert into public.bcx_ai_memories (user_id, title, content, category, fingerprint)
      values (
        job.user_id,
        case when char_length(job.content) > 92 then left(job.content, 89) || '…' else job.content end,
        job.content, job.category, job.fingerprint
      )
      on conflict (user_id, fingerprint) where fingerprint is not null do nothing;

      delete from public.bcx_memory_queue where user_id = job.user_id and fingerprint = job.fingerprint;
      processed := processed + 1;
    exception when others then
      update public.bcx_memory_queue
      set attempts = least(job.attempts + 1, 10),
          available_at = now() + pg_catalog.make_interval(mins => least(60, 1 << job.attempts))
      where user_id = job.user_id and fingerprint = job.fingerprint;
      raise log 'BCX memory queue retry (SQLSTATE %)', SQLSTATE;
    end;
  end loop;
  return processed;
end;
$$;

revoke execute on function public.bcx_process_memory_queue() from public, anon, authenticated;

select cron.schedule('bcx-cloud-memory', '* * * * *', $$select public.bcx_process_memory_queue()$$);
notify pgrst, 'reload schema';
