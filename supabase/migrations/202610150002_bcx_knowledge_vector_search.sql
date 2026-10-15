-- Semantic search for BCX knowledge. Embeddings are generated server-side with Gemini.
create extension if not exists vector with schema extensions;

alter table public.bcx_knowledge_chunks
  add column if not exists embedding extensions.vector(768);

create index if not exists bcx_knowledge_chunks_embedding_hnsw_idx
  on public.bcx_knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_bcx_knowledge(
  query_embedding extensions.vector(768),
  match_count integer default 5,
  min_similarity real default 0.2
)
returns table (
  title text,
  source_url text,
  language text,
  content text,
  similarity real
)
language sql
stable
set search_path = ''
as $$
  select
    k.title,
    k.source_url,
    k.language,
    k.content,
    (1 - (k.embedding <=> query_embedding))::real as similarity
  from public.bcx_knowledge_chunks as k
  where k.is_public = true
    and k.embedding is not null
    and (1 - (k.embedding <=> query_embedding)) >= greatest(-1, least(min_similarity, 1))
  order by k.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

revoke all on function public.match_bcx_knowledge(extensions.vector, integer, real) from public;
grant execute on function public.match_bcx_knowledge(extensions.vector, integer, real) to anon, authenticated;
