-- E2EE Messaging schema. Run in your Supabase SQL editor.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  public_key text not null,
  created_at timestamptz default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text,                 -- for groups: encrypted; for 1:1: null
  is_group boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  encrypted_room_key text not null,  -- room sym key sealed for this user
  ek_nonce text not null,            -- nonce used to seal the room key
  ek_sender_key text not null,       -- public key used to seal (for nacl.box.open)
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade not null,
  sender_id uuid references public.users(id) on delete cascade not null,
  encrypted_content text not null,
  nonce text not null,
  created_at timestamptz default now()
);

create index if not exists messages_room_created_idx
  on public.messages(room_id, created_at);

alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

-- Helper: is current user a member of room?
create or replace function public.is_room_member(_room uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = _room and user_id = _user
  );
$$;

-- USERS
drop policy if exists "read all public keys" on public.users;
create policy "read all public keys" on public.users
  for select using (true);

drop policy if exists "insert own profile" on public.users;
create policy "insert own profile" on public.users
  for insert with check (auth.uid() = id);

drop policy if exists "update own profile" on public.users;
create policy "update own profile" on public.users
  for update using (auth.uid() = id);

-- ROOMS
drop policy if exists "read rooms member of" on public.rooms;
create policy "read rooms member of" on public.rooms
  for select using (public.is_room_member(id, auth.uid()));

drop policy if exists "any auth can create rooms" on public.rooms;
create policy "any auth can create rooms" on public.rooms
  for insert with check (auth.uid() is not null);

-- ROOM MEMBERS
drop policy if exists "read memberships of own rooms" on public.room_members;
create policy "read memberships of own rooms" on public.room_members
  for select using (public.is_room_member(room_id, auth.uid()));

drop policy if exists "insert memberships" on public.room_members;
create policy "insert memberships" on public.room_members
  for insert with check (auth.uid() is not null);

-- MESSAGES
drop policy if exists "read messages of own rooms" on public.messages;
create policy "read messages of own rooms" on public.messages
  for select using (public.is_room_member(room_id, auth.uid()));

drop policy if exists "insert messages to own rooms" on public.messages;
create policy "insert messages to own rooms" on public.messages
  for insert with check (
    auth.uid() = sender_id and public.is_room_member(room_id, auth.uid())
  );

-- Realtime
alter publication supabase_realtime add table public.messages;
