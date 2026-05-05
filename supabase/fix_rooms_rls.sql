-- Fix RLS on rooms / room_members so any authenticated session can create
-- and read back a new conversation. Run in the Supabase SQL editor.

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

drop policy if exists "any auth can create rooms" on public.rooms;
create policy "any auth can create rooms" on public.rooms
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "read rooms member of" on public.rooms;
create policy "read rooms member of" on public.rooms
  for select
  to authenticated
  using (public.is_room_member(id, public.current_user_id()));

drop policy if exists "insert memberships" on public.room_members;
create policy "insert memberships" on public.room_members
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "read memberships of own rooms" on public.room_members;
create policy "read memberships of own rooms" on public.room_members
  for select
  to authenticated
  using (public.is_room_member(room_id, public.current_user_id()));
