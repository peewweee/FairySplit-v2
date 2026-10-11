/**
 * The room a path belongs to, or null on any other page.
 *
 * `/rooms/abc`, `/rooms/abc/settings` and `/rooms/abc/bills/xyz` are all room
 * "abc", which is what lets the menu mark the room you are in from any of them.
 */
export function roomIdFromPath(pathname: string): string | null {
  const match = /^\/rooms\/([^/]+)/.exec(pathname);
  return match ? match[1] : null;
}
