/**
 * Notifies open screens that the store changed. `useRepoQuery` subscribes to
 * exactly this one event name — shared by both repositories, so it does not
 * need to know or care which store actually wrote.
 *
 * LocalRepository fires it after every localStorage write (see
 * local-repository.ts); SupabaseRepository fires it after every successful
 * write method, wrapped once in its constructor rather than called by hand
 * in each of its ~35 write methods — see the Proxy there.
 */
export const CHANGE_EVENT = "fairysplit:changed";

export function notifyChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
