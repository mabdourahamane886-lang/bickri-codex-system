-- Expose BCX capability tables to the Supabase Data API with explicit grants.
-- RLS remains the row-level authorization boundary.

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.bcx_ai_memories to authenticated, service_role;
grant select, insert on table public.bcx_ai_feedback to authenticated;
grant select, insert, update, delete on table public.bcx_ai_feedback to service_role;
grant select, insert, update, delete on table public.bcx_ai_usage_events to service_role;

drop policy if exists "Users manage own BCX memories" on public.bcx_ai_memories;
create policy "Users manage own BCX memories"
  on public.bcx_ai_memories
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read own BCX feedback" on public.bcx_ai_feedback;
create policy "Users read own BCX feedback"
  on public.bcx_ai_feedback
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users submit own BCX feedback" on public.bcx_ai_feedback;
create policy "Users submit own BCX feedback"
  on public.bcx_ai_feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
