/**
 * Where a person's name lives depends on how they signed up.
 *
 * Our own form writes `display_name`, because that is what the
 * `on_auth_user_created` trigger reads. Google sends `full_name` and `name`
 * instead, and never `display_name` — so reading only our own key would leave
 * every Google account nameless.
 */
const KEYS = ["display_name", "full_name", "name"] as const;

export function displayNameFrom(
  metadata: Record<string, unknown> | undefined | null,
): string {
  for (const key of KEYS) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
