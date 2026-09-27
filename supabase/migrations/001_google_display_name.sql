/* ---------------------------------------------------------------------------
 * Teach handle_new_user where Google keeps a person's name.
 *
 * Our own signup form writes `display_name` into raw_user_meta_data, so the
 * original trigger read exactly that key. Google never sends `display_name` —
 * it sends `full_name`, and `name` alongside it. Reading only our own key
 * would give every Google account an empty profile name.
 *
 * Order matters: our own value wins where it exists, because somebody who
 * typed "Ate Phoebe" meant it more than Google's copy of their legal name.
 *
 * Safe to re-run, and safe on the existing rows — it only changes what future
 * signups get. Backfill for anybody already created is at the bottom.
 * ------------------------------------------------------------------------- */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The trigger itself is unchanged, but recreate it so a fresh database built
-- from these files in order ends up in the same state as an upgraded one.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anybody who signed up before this ran and ended up nameless.
update public.profiles p
set display_name = coalesce(
  nullif(u.raw_user_meta_data ->> 'display_name', ''),
  nullif(u.raw_user_meta_data ->> 'full_name', ''),
  nullif(u.raw_user_meta_data ->> 'name', ''),
  ''
)
from auth.users u
where u.id = p.id
  and p.display_name = '';
