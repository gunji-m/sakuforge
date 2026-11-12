/** Mirrors DEFAULT_INSPECTION_LIMITS.maxBytes without pulling the core into the browser bundle. */
export const MAX_CSV_BYTES = 4 * 1024 * 1024;

export type PrecheckResult = "ok" | "file_name" | "too_large";

/**
 * Checks before sending, for convenience only: the server never sees the file name and enforces
 * the size itself (docs/domain-rules.md 1).
 */
export function precheckFile(name: string, size: number): PrecheckResult {
  if (
    name.length > 255 ||
    /[/\\]/.test(name) ||
    /\p{Cc}/u.test(name) ||
    !name.toLowerCase().endsWith(".csv")
  ) {
    return "file_name";
  }
  return size > MAX_CSV_BYTES ? "too_large" : "ok";
}
