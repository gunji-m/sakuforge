/** Response headers that act as the browser-side safety net (docs/design.md section 7). */

export interface Header {
  readonly key: string;
  readonly value: string;
}

/** Headers attached to every response, pages and API alike. */
export const COMMON_HEADERS: readonly Header[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  // The service is public but not listed (ADR 0006).
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** The API returns JSON only, so a response from it may load nothing at all. */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";

const NONCE_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Builds the Content-Security-Policy of a page response. Scripts and styles run only
 * from this origin or with the nonce of this response, so text that reaches the page
 * from outside cannot run as code even if it were rendered as markup by mistake.
 *
 * In development, React needs `eval` for debugging and injects styles while editing.
 */
export function pageContentSecurityPolicy(nonce: string, development: boolean): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("invalid nonce");
  const script = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`;
  const style = `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`;
  return [
    "default-src 'self'",
    script,
    style,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
