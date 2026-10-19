-- =====================================================================
-- P0-4: profiles. One row per signed-up user, created by a trigger on auth.users.
-- Who can read a profile is decided in 0002 (people who share a campaign), because
-- that needs the members table.
-- =====================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Create the profile on sign-up. The name comes from the OAuth metadata when there is one,
-- otherwise from the part of the email before the @.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 80),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who signed up before this migration (for example on an existing project) get a profile too.
insert into public.profiles (id, display_name, avatar_url)
select u.id,
       left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)), 80),
       u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;
