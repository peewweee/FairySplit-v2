-- FairySplit — proving checkpoint_clock does what it says.
--
-- Run this after applying supabase/migrations/003_checkpoint_clock.sql (a fresh
-- schema.sql already has it). Like verify-rls.sql it is self-contained: it makes
-- its own two throwaway accounts, uses them, and deletes them. Nothing is left
-- behind either way — a failed check raises, which rolls the whole transaction
-- back including the test accounts.
--
-- What it proves, for a clock that has been left on for 52 hours:
--
--   * cutting it at two midnights leaves one entry per day, each ending a
--     millisecond short of its cutoff (so it reads 11:59 PM), with the run
--     carrying on from the last cutoff exactly (12:00 AM);
--   * asking again, or with cutoffs in the future or before the run began, logs
--     nothing twice and changes nothing;
--   * stopping afterwards adds only what is left, and the whole still adds up to
--     the 52 hours — a cut never creates or loses time;
--   * somebody outside the room can neither cut the clock nor read the result.
--
-- Everything is relative to now(), so it can be run at any time of day. The
-- same two gotchas as verify-rls.sql apply: the SQL editor bypasses row-level
-- security unless the role is dropped, and `auth.uid()` reads a forged claim.

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-4000-8000-000000000001', 'clock-test-a@fairysplit.invalid', '{"display_name":"Ana"}'::jsonb),
  ('dddddddd-0000-4000-8000-000000000002', 'clock-test-b@fairysplit.invalid', '{"display_name":"Bea"}'::jsonb)
on conflict (id) do nothing;

do $$
declare
  user_a uuid := 'cccccccc-0000-4000-8000-000000000001';
  user_b uuid := 'dddddddd-0000-4000-8000-000000000002';
  v_room    public.rooms;
  v_tracker uuid;
  v_member  uuid;
  v_other   uuid;
  v_began   timestamptz := now() - interval '52 hours';
  v_cut1    timestamptz := now() - interval '40 hours';
  v_cut2    timestamptz := now() - interval '16 hours';
  v_run     timestamptz;
  v_seen    integer;
  v_total   double precision;
  v_blocked boolean;
  e1        public.log_entries;
  e2        public.log_entries;
begin
  /* -- as A: a clock that has been on for 52 hours ----------------------- */
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_a)::text, true);

  v_room := public.create_room('Clock Test Flat', 'Ana', 'ZZCLCK');

  select id into v_tracker from public.trackers where room_id = v_room.id;
  select id into v_member from public.members where room_id = v_room.id and user_id = user_a;
  if v_tracker is null or v_member is null then
    raise exception 'FAIL: create_room did not make the built-in clock and its first member';
  end if;

  -- Shared on purpose: a clock charged to two people must stay charged to both.
  insert into public.members (room_id, name) values (v_room.id, 'Jem') returning id into v_other;
  perform public.start_clock(v_tracker, v_member, array[v_member, v_other]);
  update public.tracker_runs set started_at = v_began
  where tracker_id = v_tracker and member_id = v_member;

  /* -- cut at two midnights (out of order on purpose) -------------------- */
  perform public.checkpoint_clock(v_tracker, v_member, array[v_cut2, v_cut1]);

  select count(*) into v_seen from public.log_entries where tracker_id = v_tracker;
  if v_seen <> 2 then
    raise exception 'FAIL: cutting at 2 midnights should leave 2 entries, got %', v_seen;
  end if;

  select * into e1 from public.log_entries where tracker_id = v_tracker order by started_at asc  limit 1;
  select * into e2 from public.log_entries where tracker_id = v_tracker order by started_at desc limit 1;

  if e1.started_at <> v_began then raise exception 'FAIL: the first entry does not start where the run did'; end if;
  if e1.ended_at <> v_cut1 - interval '1 millisecond' then
    raise exception 'FAIL: the first entry should end a millisecond before its cutoff, got %', e1.ended_at;
  end if;
  if e2.started_at <> v_cut1 then raise exception 'FAIL: the second entry should start at the first cutoff'; end if;
  if e2.ended_at <> v_cut2 - interval '1 millisecond' then
    raise exception 'FAIL: the second entry should end a millisecond before its cutoff, got %', e2.ended_at;
  end if;
  if abs(e1.quantity - 12) > 0.0001 or abs(e2.quantity - 24) > 0.0001 then
    raise exception 'FAIL: expected 12 and 24 hours, got % and %', e1.quantity, e2.quantity;
  end if;
  if e1.participant_ids <> array[v_member, v_other] or e2.participant_ids <> array[v_member, v_other] then
    raise exception 'FAIL: the entries are not charged to the people the clock was started for';
  end if;
  if e1.created_at <> e1.ended_at or e2.created_at <> e2.ended_at then
    raise exception 'FAIL: an entry should be stamped when it ended, like a stopped clock';
  end if;

  select started_at into v_run from public.tracker_runs
  where tracker_id = v_tracker and member_id = v_member;
  if v_run is distinct from v_cut2 then
    raise exception 'FAIL: the clock should carry on from the last cutoff, got %', v_run;
  end if;

  /* -- asking again, or with cutoffs that make no sense: nothing happens -- */
  perform public.checkpoint_clock(v_tracker, v_member, array[v_cut1, v_cut2]);
  perform public.checkpoint_clock(v_tracker, v_member,
    array[now() + interval '1 hour', v_began - interval '1 hour', null]::timestamptz[]);

  select count(*) into v_seen from public.log_entries where tracker_id = v_tracker;
  if v_seen <> 2 then raise exception 'FAIL: a repeat or a nonsense cutoff changed the log (% entries)', v_seen; end if;
  select started_at into v_run from public.tracker_runs
  where tracker_id = v_tracker and member_id = v_member;
  if v_run is distinct from v_cut2 then raise exception 'FAIL: a repeat or a nonsense cutoff moved the clock'; end if;

  /* -- stopping adds what is left, and nothing is lost ------------------- */
  perform public.stop_clock(v_tracker, v_member);

  select count(*), sum(quantity) into v_seen, v_total
  from public.log_entries where tracker_id = v_tracker;
  if v_seen <> 3 then raise exception 'FAIL: stopping should leave 3 entries, got %', v_seen; end if;
  if abs(v_total - 52) > 0.0001 then raise exception 'FAIL: the entries add up to % hours, not 52', v_total; end if;
  select count(*) into v_seen from public.tracker_runs where tracker_id = v_tracker;
  if v_seen <> 0 then raise exception 'FAIL: the clock is still running after it was stopped'; end if;

  /* -- as B: not in the room -------------------------------------------- */
  perform set_config('request.jwt.claims', json_build_object('sub', user_b)::text, true);

  v_blocked := false;
  begin
    perform public.checkpoint_clock(v_tracker, v_member, array[v_cut1]);
  exception when others then v_blocked := true; end;
  if not v_blocked then raise exception 'FAIL: B can cut a clock in a room B is not in'; end if;

  select count(*) into v_seen from public.log_entries where tracker_id = v_tracker;
  if v_seen <> 0 then raise exception 'FAIL: B can READ the entries a cut wrote (% of them)', v_seen; end if;

  /* -- clean up ---------------------------------------------------------- */
  -- Back to the session role first: `authenticated` cannot touch auth.users,
  -- and deleting the room under RLS would silently match nothing.
  perform set_config('role', 'none', true);
  delete from public.rooms where join_code = 'ZZCLCK';
  delete from auth.users where email like 'clock-test-%@fairysplit.invalid';
end;
$$;

-- Reached only if every check above passed.
select 'ALL CHECKS PASSED' as result,
       (select count(*) from auth.users where email like 'clock-test-%@fairysplit.invalid') as test_users_left,
       (select count(*) from public.rooms where join_code = 'ZZCLCK') as test_rooms_left;
