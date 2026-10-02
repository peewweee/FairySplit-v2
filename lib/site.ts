// Where invite links point. Fixed on purpose: a link made on localhost or a preview URL is useless to a housemate.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://fairy-split-v2.vercel.app").replace(/\/+$/, "");

/** The room's join URL. Empty until the room has loaded. */
export function inviteLink(code: string): string {
  return code ? `${SITE_URL}/?join=${code}` : "";
}
