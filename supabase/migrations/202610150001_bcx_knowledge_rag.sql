-- Knowledge library for Bickri AI: text-search RAG with source metadata.
create table if not exists public.bcx_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  language text not null default 'fr',
  chunk_index integer not null default 0,
  content text not null,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  is_public boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_url, chunk_index)
);

create index if not exists bcx_knowledge_chunks_search_idx
  on public.bcx_knowledge_chunks using gin (search_vector);
create index if not exists bcx_knowledge_chunks_public_idx
  on public.bcx_knowledge_chunks (is_public, created_at desc);

alter table public.bcx_knowledge_chunks enable row level security;

drop policy if exists "Read public BCX knowledge" on public.bcx_knowledge_chunks;
create policy "Read public BCX knowledge"
  on public.bcx_knowledge_chunks for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists "Editors insert BCX knowledge" on public.bcx_knowledge_chunks;
create policy "Editors insert BCX knowledge"
  on public.bcx_knowledge_chunks for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.bcx_profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'editor')
    )
  );

drop policy if exists "Editors delete BCX knowledge" on public.bcx_knowledge_chunks;
create policy "Editors delete BCX knowledge"
  on public.bcx_knowledge_chunks for delete
  to authenticated
  using (
    exists (
      select 1 from public.bcx_profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'editor')
    )
  );
