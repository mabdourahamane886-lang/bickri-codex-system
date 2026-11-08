-- Restrict Data API access to the minimum roles and operations BCX needs.
revoke all on table public.bcx_ai_memories from anon, authenticated, service_role;
revoke all on table public.bcx_ai_feedback from anon, authenticated, service_role;
revoke all on table public.bcx_ai_usage_events from anon, authenticated, service_role;

grant select, insert, update, delete on table public.bcx_ai_memories to authenticated, service_role;
grant select, insert on table public.bcx_ai_feedback to authenticated;
grant select, insert, update, delete on table public.bcx_ai_feedback to service_role;
grant select, insert, update, delete on table public.bcx_ai_usage_events to service_role;

notify pgrst, 'reload schema';
