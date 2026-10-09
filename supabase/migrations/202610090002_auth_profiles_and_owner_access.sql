-- BCX migration 002: create profiles for new accounts and allow users to manage their own products.
-- Run only in the dedicated BCX Supabase project: ahyjrpeweniwrnuedkux.
create or replace function public.bcx_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bcx_profiles (user_id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists bcx_on_auth_user_created on auth.users;
create trigger bcx_on_auth_user_created
after insert on auth.users
for each row execute function public.bcx_handle_new_user();

-- Self-owned records can be managed by their owner; existing admin/editor policy remains valid.
create policy "Users insert own products" on public.bcx_products
for insert to authenticated
with check (owner_user_id = auth.uid());

create policy "Users update own products" on public.bcx_products
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "Users delete own products" on public.bcx_products
for delete to authenticated
using (owner_user_id = auth.uid());

-- Profiles are intentionally read-only to clients: role elevation must be performed by an administrator.
drop policy if exists "Users update own profile" on public.bcx_profiles;
