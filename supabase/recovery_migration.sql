-- Recovery support: decouple persistent identity from anonymous auth session.
-- Run AFTER schema.sql.

-- 1) Drop FK from users.id -> auth.users (id is now a stable identity uuid).
alter table public.users
  drop constraint if exists users_id_fkey;

-- Ensure id can be generated independently of auth.users.
alter table public.users
  alter column id set default gen_random_uuid();

-- 2) Add link to current auth session.
alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- Backfill for existing rows (id == auth uid before this migration).
update public.users set auth_user_id = id where auth_user_id is null;

-- 3) Update RLS to use auth_user_id.
drop policy if exists "insert own profile" on public.users;
create policy "insert own profile" on public.users
  for insert with check (auth.uid() = auth_user_id);

drop policy if exists "update own profile" on public.users;
create policy "update own profile" on public.users
  for update using (auth.uid() = auth_user_id);

-- 4) Update room_members / messages helpers to look up by auth.uid().
-- is_room_member already takes a user id; we need callers to pass the
-- public.users.id, not auth.uid(). Add a helper that resolves it.
create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid() limit 1;
$$;

-- Update RLS policies that previously used auth.uid() directly against users.id.
drop policy if exists "read rooms member of" on public.rooms;
create policy "read rooms member of" on public.rooms
  for select using (public.is_room_member(id, public.current_user_id()));

drop policy if exists "read memberships of own rooms" on public.room_members;
create policy "read memberships of own rooms" on public.room_members
  for select using (public.is_room_member(room_id, public.current_user_id()));

drop policy if exists "insert memberships" on public.room_members;
create policy "insert memberships" on public.room_members
  for insert with check (auth.uid() is not null);

drop policy if exists "read messages of own rooms" on public.messages;
create policy "read messages of own rooms" on public.messages
  for select using (public.is_room_member(room_id, public.current_user_id()));

drop policy if exists "insert messages to own rooms" on public.messages;
create policy "insert messages to own rooms" on public.messages
  for insert with check (
    sender_id = public.current_user_id()
    and public.is_room_member(room_id, public.current_user_id())
  );

-- 5) Claim function: given a username + the public key derived from a
-- recovery phrase, transfer the account's auth_user_id to the current session.
create or replace function public.claim_account(_username text, _public_key text)
returns public.users
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.users;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into u from public.users where username = _username;
  if not found then
    raise exception 'no such account';
  end if;

  if u.public_key <> _public_key then
    raise exception 'recovery phrase does not match this account';
  end if;

  update public.users
    set auth_user_id = auth.uid()
    where id = u.id
    returning * into u;

  return u;
end;
$$;

grant execute on function public.claim_account(text, text) to authenticated;
