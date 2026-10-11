-- Cut a running clock at midnight, so each day gets an entry of its own.
--
-- A clock left on across midnight used to be stored as ONE entry spanning every
-- day it ran — 52 hours dated "Oct 8" on the logs page. Bills were never wrong
-- (they count by overlap with their own dates), but the logs were. This adds the
-- one function the app needs to fix it; nothing existing is changed, so it is
-- safe to run before the app that calls it is deployed.
--
-- The app calls it on its own while a clock is open, and again just before it
-- stops the clock, so a clock left running with the app closed overnight still
-- comes out split when it is finally stopped.

begin;

/**
 * Cuts a running clock at the midnights it has crossed.
 *
 * The CLIENT says where to cut — it knows the household's timezone and the
 * database does not — but never how much time has passed. Every cutoff must
 * fall after the run began and no later than Postgres's own clock; any that does
 * not is ignored. A client with a wrong system clock cannot cut itself extra
 * hours, and a repeat call, or two tabs racing, cannot log a day twice: the run
 * is locked, and a cutoff it has already moved past is skipped.
 *
 * Each day's entry stops one millisecond short of its cutoff, so it reads
 * 11:59 PM, and the run carries on from the cutoff exactly, so the next reads
 * 12:00 AM. The millisecond nobody is credited with is about 3e-7 of an hour.
 * A piece too short to count is not logged — the same floor stop_clock has.
 * Every piece is charged to whoever the run was charged to when it began, and is
 * stamped created_at = ended_at like a stopped run, so the history (newest first
 * by created_at) lists the evening before the morning.
 */
create or replace function public.checkpoint_clock(
  p_tracker_id uuid,
  p_member_id uuid,
  p_cutoffs timestamptz[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   public.tracker_runs;
  v_from  timestamptz;
  v_cut   timestamptz;
  v_end   timestamptz;
  v_hours double precision;
  v_now   timestamptz := now();
begin
  if not private.can_touch_tracker(p_tracker_id) then
    raise exception 'Not a member of this room';
  end if;

  -- The app never sends more than this; a run would have to be over a year old.
  if coalesce(array_length(p_cutoffs, 1), 0) > 400 then
    raise exception 'Too many cut points';
  end if;

  select * into v_run
  from public.tracker_runs
  where tracker_id = p_tracker_id and member_id = p_member_id
  for update;

  if not found then
    return;
  end if;

  v_from := v_run.started_at;

  for v_cut in
    select t.c from unnest(p_cutoffs) as t(c) where t.c is not null order by t.c
  loop
    -- Not after the run began, or not yet reached: nothing to cut here.
    continue when v_cut <= v_from or v_cut > v_now;

    v_end   := v_cut - interval '1 millisecond';
    v_hours := extract(epoch from (v_end - v_from)) / 3600.0;

    if v_hours > 0 then
      insert into public.log_entries (tracker_id, participant_ids, quantity, started_at, ended_at, created_at)
      values (
        p_tracker_id,
        case when array_length(v_run.charged_to, 1) > 0 then v_run.charged_to else array[p_member_id] end,
        v_hours,
        v_from,
        v_end,
        v_end
      );
    end if;

    v_from := v_cut;
  end loop;

  if v_from <> v_run.started_at then
    update public.tracker_runs
    set started_at = v_from
    where tracker_id = p_tracker_id and member_id = p_member_id;
  end if;
end;
$$;

-- `anon` is named as well as PUBLIC: a project's default privileges can give it
-- EXECUTE directly, which revoking from PUBLIC alone does not take back. The
-- function refuses a signed-out caller anyway; this stops it being reachable.
revoke execute on function public.checkpoint_clock(uuid, uuid, timestamptz[]) from public, anon;
grant  execute on function public.checkpoint_clock(uuid, uuid, timestamptz[]) to authenticated;

commit;
