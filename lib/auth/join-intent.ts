import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, normaliseJoinCode } from "@/lib/data/join-code";

/** Carries a room invite across sign-in, which leaves the site for Google and comes back. */
export const JOIN_COOKIE = "fairysplit_join";

/** A well-formed join code, or null. Never trust the URL: this ends up in a cookie and a redirect. */
export function cleanJoinCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = normaliseJoinCode(raw);
  if (code.length !== JOIN_CODE_LENGTH) return null;
  return [...code].every((ch) => JOIN_CODE_ALPHABET.includes(ch)) ? code : null;
}

/** The sign-in page, remembering the invite (and what went wrong) if there is one. */
export function loginPath(invite: string | null, error?: string): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (invite) params.set("join", invite);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

/** Where to land once signed in: the rooms page, with the Join dialog opened for an invite. */
export function afterSignInPath(invite: string | null): string {
  return invite ? `/?join=${invite}` : "/";
}
