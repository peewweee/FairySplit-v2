/**
 * The join code alphabet and the code it spells, shared by both
 * repositories so a code minted by one reads the same as one minted by the
 * other. 6 chars; 0/O/1/I deliberately absent — they get misread out loud.
 */
export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const JOIN_CODE_LENGTH = 6;

/** Normalises what the user typed so "abc 123" finds "ABC123". */
export function normaliseJoinCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** One candidate code. The caller decides what "taken" means and retries. */
export function randomJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(JOIN_CODE_LENGTH));
  let code = "";
  for (const b of bytes) code += JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length];
  return code;
}
