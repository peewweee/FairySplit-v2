-- SupabaseRepository support: three operations that touch more than one row
-- and need to not half-happen.
--
-- Everything else the repository does is plain single-table CRUD, which RLS
-- already covers directly — no function needed. These three are different:
--
--   * start_clock / stop_clock read and write Postgres's own clock, not the
--     browser's. "Wall-clock is read at the edge" (repository.ts) now means
--     THIS edge — a client with a wrong system clock should not be able to
--     hand itself extra hours.
--   * remove_member touches every bill and every log in the room, not just
--     one row, and a member's own id also lives inside two JSONB arrays
--     (bills.uses, bills.other_charges) that no foreign key reaches. A crash
--     halfway through a client-side loop would leave a phantom participant
--     behind; a function makes it one transaction or none.

begin;

/**
 * No-op if already running — matches LocalRepository exactly: leave the
 * original start alone rather than discard however long they've been in.
 * The unique (tracker_id, member_id) primary key on tracker_runs makes that
 * a plain ON CONFLICT DO NOTHING, no SELECT-then-branch needed.
 */
create or replace function public.start_clock(
  p_tracker_id uuid,
  p_member_id uuid,
  p_charged_to uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.can_touch_tracker(p_tracker_id) then
    raise exception 'Not a member of this room';
  end if;

  insert into public.tracker_runs (tracker_id, member_id, started_at, charged_to)
  values (
    p_tracker_id,
    p_member_id,
    now(),
    case when array_length(p_charged_to, 1) > 0 then p_charged_to else array[p_member_id] end
  )
  on conflict (tracker_id, member_id) do nothing;
end;
$$;

/**
 * Closes a running clock into a log entry. No-op if nothing is running.
 * A run under one second — a mis-tap — is not worth a row, same floor
 * LocalRepository uses.
 */
create or replace function public.stop_clock(p_tracker_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started   timestamptz;
  v_charged   uuid[];
  v_ended     timestamptz := now();
  v_hours     double precision;
begin
  if not private.can_touch_tracker(p_tracker_id) then
    raise exception 'Not a member of this room';
  end if;

  delete from public.tracker_runs
  where tracker_id = p_tracker_id and member_id = p_member_id
  returning started_at, charged_to into v_started, v_charged;

  if v_started is null then
    return;
  end if;

  v_hours := extract(epoch from (v_ended - v_started)) / 3600.0;
  if v_hours <= 0 then
    return;
  end if;

  insert into public.log_entries (tracker_id, participant_ids, quantity, started_at, ended_at, created_at)
  values (
    p_tracker_id,
    case when array_length(v_charged, 1) > 0 then v_charged else array[p_member_id] end,
    v_hours,
    v_started,
    v_ended,
    v_ended
  );
end;
$$;

/**
 * Remove a person from a room, and from everywhere their id was written:
 * their own row, every clock they had running, every entry and use and
 * charge that named them (dropping ones left with nobody on them), and
 * every per-member fact about them. Whatever a room member could see before
 * this runs, they see correctly after — no ghost participant left behind.
 */
create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  select room_id into v_room_id from public.members where id = p_member_id;
  if v_room_id is null then
    raise exception 'That person is no longer in this room';
  end if;
  if not private.is_member_of(v_room_id) then
    raise exception 'Not a member of this room';
  end if;

  -- Log entries: drop the member from participant_ids; an entry left with
  -- nobody on it is meaningless, same as LocalRepository.
  update public.log_entries le
  set participant_ids = array_remove(le.participant_ids, p_member_id)
  from public.trackers t
  where t.id = le.tracker_id
    and t.room_id = v_room_id
    and p_member_id = any (le.participant_ids);

  delete from public.log_entries le
  using public.trackers t
  where t.id = le.tracker_id
    and t.room_id = v_room_id
    and array_length(le.participant_ids, 1) is null;

  -- Bills: uses drop empty (never null — ApplianceUse.participantIds is
  -- never optional); other_charges with this member listed revert to null
  -- (= everyone) rather than an empty list nobody can settle.
  update public.bills b
  set
    uses = (
      select coalesce(jsonb_agg(u2), '[]'::jsonb)
      from (
        select jsonb_set(
          u,
          '{participantIds}',
          (
            select coalesce(jsonb_agg(pid), '[]'::jsonb)
            from jsonb_array_elements_text(u -> 'participantIds') pid
            where pid <> p_member_id::text
          )
        ) as u2
        from jsonb_array_elements(b.uses) u
      ) filtered
      where jsonb_array_length(filtered.u2 -> 'participantIds') > 0
    ),
    other_charges = (
      select coalesce(jsonb_agg(
        case
          -- JSON null, not SQL null: jsonb_array_elements_text errors on a
          -- scalar, so a charge already shared by everyone must skip it.
          when c -> 'participantIds' = 'null'::jsonb then c
          else jsonb_set(
            c,
            '{participantIds}',
            coalesce(
              (
                select jsonb_agg(pid)
                from jsonb_array_elements_text(c -> 'participantIds') pid
                where pid <> p_member_id::text
              ),
              'null'::jsonb
            )
          )
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(b.other_charges) c
    )
  where b.room_id = v_room_id;

  -- Per-member facts. FK cascades (tracker_runs, bill_member_hours,
  -- bill_log_amounts, bill_paid) handle themselves on the delete below.
  delete from public.members where id = p_member_id;
end;
$$;

revoke execute on function public.start_clock(uuid, uuid, uuid[]) from public;
revoke execute on function public.stop_clock(uuid, uuid)          from public;
revoke execute on function public.remove_member(uuid)             from public;

grant execute on function public.start_clock(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.stop_clock(uuid, uuid)          to authenticated;
grant execute on function public.remove_member(uuid)             to authenticated;

commit;
