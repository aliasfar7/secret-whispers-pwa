-- Atomic, RLS-safe room creation.
-- Creates a room and inserts all member rows in a single SECURITY DEFINER call
-- so RLS can't reject the post-insert read or the membership inserts. The
-- function still enforces that the caller is one of the members.
--
-- Run in the Supabase SQL editor.

create or replace function public.create_room_with_members(
  _is_group boolean,
  _name text,
  _members jsonb -- [{ user_id, encrypted_room_key, ek_nonce, ek_sender_key }, ...]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := public.current_user_id();
  new_room_id uuid;
  member_ids uuid[];
begin
  if caller_id is null then
    raise exception 'not authenticated';
  end if;

  -- Caller must be in the member list.
  select array_agg((m->>'user_id')::uuid) into member_ids
  from jsonb_array_elements(_members) as m;

  if member_ids is null or array_length(member_ids, 1) = 0 then
    raise exception 'no members provided';
  end if;

  if not (caller_id = any(member_ids)) then
    raise exception 'caller must be a member of the room';
  end if;

  insert into public.rooms (is_group, name)
    values (_is_group, _name)
    returning id into new_room_id;

  insert into public.room_members
    (room_id, user_id, encrypted_room_key, ek_nonce, ek_sender_key)
  select
    new_room_id,
    (m->>'user_id')::uuid,
    m->>'encrypted_room_key',
    m->>'ek_nonce',
    m->>'ek_sender_key'
  from jsonb_array_elements(_members) as m;

  return new_room_id;
end;
$$;

grant execute on function public.create_room_with_members(boolean, text, jsonb)
  to authenticated;
