-- Semantic retrieval for BCX knowledge. Uses Supabase pgvector extension.
create extension if not exists vector with schema extensions;

alter table public.bcx_knowledge_chunks
  add column if not exists embedding extensions.vector(768);

create index if not exists bcx_knowledge_chunks_embedding_idx
  on public.bcx_knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create or replace function public.match_bcx_knowledge(
  query_embedding extensions.vector(768),
  match_count integer default 5,
  min_similarity double precision default 0.2
)
returns table (
  title text,
  source_url text,
  language text,
  content text,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    k.title,
    k.source_url,
    k.language,
    k.content,
    (1 - (k.embedding <=> query_embedding))::double precision as similarity
  from public.bcx_knowledge_chunks as k
  where k.is_public = true
    and k.embedding is not null
    and (1 - (k.embedding <=> query_embedding)) >= min_similarity
  order by k.embedding <=> query_embedding
  limit greatest(1, least(match_count, 10));
$$;

drop policy if exists "Editors update BCX knowledge" on public.bcx_knowledge_chunks;
create policy "Editors update BCX knowledge"
  on public.bcx_knowledge_chunks for update
  to authenticated
  using (
    exists (
      select 1 from public.bcx_profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.bcx_profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'editor')
    )
  );

grant execute on function public.match_bcx_knowledge(extensions.vector, integer, double precision)
  to anon, authenticated;
