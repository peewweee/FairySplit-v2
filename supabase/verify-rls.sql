-- FairySplit — proving the privacy rules actually hold.
--
-- Run this after schema.sql, and again after ANY change to a policy or a
-- helper. It is self-contained: it makes its own two throwaway accounts, uses
-- them, and deletes them. Nothing is left behind either way — a failed check
-- raises, which rolls the whole transaction back including the test accounts.
--
-- What it proves: person B cannot read, write, or delete anything in a room
-- belonging to person A — AND person A can. Both halves matter. A rule that
-- blocks everybody would pass the first half on its own and be useless.
--
-- Two things make this a real test rather than theatre:
--
--   * The SQL editor runs as `postgres`, which bypasses row-level security
--     entirely. `set_config('role','authenticated')` drops that, so the
--     queries arrive the way the app's queries will.
--   * `request.jwt.claims` is forged so `auth.uid()` returns whoever we are
--     pretending to be. That is the value every policy is written against.
--
-- Gotcha worth knowing: `set_config(..., true)` lasts for the TRANSACTION, not
-- the block. Anything after the DO block still runs as `authenticated` — which
-- is why the clean-up below resets the role first, inside the block.

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'rls-test-a@fairysplit.invalid', '{"display_name":"Ana"}'::jsonb),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'rls-test-b@fairysplit.invalid', '{"display_name":"Bea"}'::jsonb)
on conflict (id) do nothing;

do $$
declare
  user_a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  user_b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  v_room    public.rooms;
  v_bill    uuid;
  v_tracker uuid;
  v_seen    integer;
  v_blocked boolean;
begin
  /* -- as A ------------------------------------------------------------- */
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_a)::text, true);

  v_room := public.create_room('RLS Test Flat', 'Ana', 'ZZTEST');

  select id into v_tracker from public.trackers where room_id = v_room.id;
  if v_tracker is null then
    raise exception 'FAIL: create_room did not make the built-in clock';
  end if;

  insert into public.bills (room_id, kind, name, total_centavos)
  values (v_room.id, 'electricity', 'Test Bill', 150000)
  returning id into v_bill;

  -- A must SEE their own things, or "B sees nothing" proves nothing.
  select count(*) into v_seen from public.rooms where id = v_room.id;
  if v_seen <> 1 then raise exception 'FAIL: A cannot see A''s own room'; end if;
  select count(*) into v_seen from public.trackers where room_id = v_room.id;
  if v_seen <> 1 then raise exception 'FAIL: A cannot see A''s own log'; end if;
  select count(*) into v_seen from public.bills where room_id = v_room.id;
  if v_seen <> 1 then raise exception 'FAIL: A cannot see A''s own bill'; end if;

  /* -- as B: every read refused ----------------------------------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', user_b)::text, true);

  select count(*) into v_seen from public.rooms where id = v_room.id;
  if v_seen <> 0 then raise exception 'FAIL: B can READ A''s room'; end if;
  select count(*) into v_seen from public.members where room_id = v_room.id;
  if v_seen <> 0 then raise exception 'FAIL: B can READ A''s housemates'; end if;
  select count(*) into v_seen from public.bills where room_id = v_room.id;
  if v_seen <> 0 then raise exception 'FAIL: B can READ A''s bills'; end if;
  select count(*) into v_seen from public.trackers where room_id = v_room.id;
  if v_seen <> 0 then raise exception 'FAIL: B can READ A''s logs'; end if;

  /* -- as B: every write refused ---------------------------------------- */
  v_blocked := false;
  begin
    insert into public.bills (room_id, kind, name, total_centavos)
    values (v_room.id, 'water', 'B was here', 999);
  exception when others then v_blocked := true; end;
  if not v_blocked then raise exception 'FAIL: B can WRITE a bill into A''s room'; end if;

  v_blocked := false;
  begin
    insert into public.log_entries (tracker_id, participant_ids, quantity)
    values (v_tracker, array[user_b], 8);
  exception when others then v_blocked := true; end;
  if not v_blocked then raise exception 'FAIL: B can WRITE a log entry into A''s room'; end if;

  -- A delete does not error under RLS; it just matches nothing. So check that
  -- the row survived rather than waiting for an exception that never comes.
  delete from public.bills where id = v_bill;
  perform set_config('request.jwt.claims', json_build_object('sub', user_a)::text, true);
  select count(*) into v_seen from public.bills where id = v_bill;
  if v_seen <> 1 then raise exception 'FAIL: B DELETED A''s bill'; end if;

  /* -- joining ----------------------------------------------------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', user_b)::text, true);

  v_blocked := false;
  begin
    perform public.join_room('NOSUCH', 'Bea');
  exception when others then v_blocked := true; end;
  if not v_blocked then raise exception 'FAIL: a made-up join code was accepted'; end if;

  perform public.join_room('zztest', 'Bea');   -- lower case on purpose

  select count(*) into v_seen from public.rooms where id = v_room.id;
  if v_seen <> 1 then raise exception 'FAIL: B joined but still cannot see the room'; end if;

  -- Pressing join twice must not make a second Bea.
  perform public.join_room('ZZTEST', 'Bea');
  select count(*) into v_seen from public.members
    where room_id = v_room.id and user_id = user_b;
  if v_seen <> 1 then raise exception 'FAIL: joining twice made % copies of B', v_seen; end if;

  /* -- clean up ---------------------------------------------------------- */
  -- Back to the session role first: `authenticated` cannot touch auth.users,
  -- and deleting the room under RLS would silently match nothing.
  perform set_config('role', 'none', true);
  delete from public.rooms where join_code = 'ZZTEST';
  delete from auth.users where email like '%@fairysplit.invalid';
end;
$$;

-- Reached only if every check above passed.
select 'ALL CHECKS PASSED' as result,
       (select count(*) from auth.users)   as users_left,
       (select count(*) from public.rooms) as rooms_left;
