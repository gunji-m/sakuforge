/**
 * Runs before `next build` (docs/design.md 4.1, #113). In the Vercel Production build only, it
 * fetches the stock master JSON from the private repository with the read-only token and writes it
 * where the server function reads it. Every other build (Preview, local, CI) uses the synthetic
 * master, so it does nothing there.
 *
 * It checks only that the answer is JSON; `next.config.ts` validates every item with the same
 * `parseStockMaster` the server function uses, so the rules live in one place.
 *
 * Output is fixed words only: never the token, the URL, the response body or exception text.
 * No dependencies: Node's standard `fetch` only.
 */
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Where the server function reads the stock master, relative to `apps/web` (process.cwd()). */
export const STOCK_MASTER_FILE = "data/stock-master/stock-master.json";
/** GitHub contents API URL of the JSON in the private repository. Kept secret (docs/design.md 4.6). */
export const URL_VARIABLE = "STOCK_MASTER_URL";
/** Read-only fine-grained token for that one repository (Contents: Read-only). */
export const TOKEN_VARIABLE = "STOCK_MASTER_TOKEN";
/** The token is sent only to this origin, over HTTPS. */
const ALLOWED_URL_PREFIX = "https://api.github.com/repos/";
/** The real master is about 0.5 MB; 20,000 stocks (the validation ceiling) fit well within this. */
export const MAX_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

/** Whether this build is the Vercel Production build (Vercel sets VERCEL_ENV). */
export function isProductionBuild(env) {
  return env.VERCEL_ENV === "production";
}

/**
 * @param {{ env: Record<string, string | undefined>, fetch: typeof fetch, root: string }} options
 * @returns {Promise<{ kind: "skipped" } | { kind: "written" } | { kind: "failed", reason: string }>}
 */
export async function fetchStockMaster({ env, fetch, root }) {
  if (!isProductionBuild(env)) return { kind: "skipped" };
  const url = env[URL_VARIABLE];
  const token = env[TOKEN_VARIABLE];
  if (typeof url !== "string" || !url.startsWith(ALLOWED_URL_PREFIX)) {
    return { kind: "failed", reason: "url_missing_or_not_allowed" };
  }
  if (typeof token !== "string" || token.length === 0) {
    return { kind: "failed", reason: "token_missing" };
  }

  let bytes;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { kind: "failed", reason: `http_${response.status}` };
    const length = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > MAX_BYTES) {
      return { kind: "failed", reason: "too_large" };
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return { kind: "failed", reason: "fetch_failed" };
  }
  if (bytes.byteLength > MAX_BYTES) return { kind: "failed", reason: "too_large" };

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    JSON.parse(text);
  } catch {
    return { kind: "failed", reason: "not_json" };
  }

  const target = resolve(root, STOCK_MASTER_FILE);
  const partial = `${target}.partial`;
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(partial, text, { encoding: "utf8", mode: 0o600 });
    await rename(partial, target);
  } catch {
    await rm(partial, { force: true });
    return { kind: "failed", reason: "write_failed" };
  }
  return { kind: "written" };
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await fetchStockMaster({ env: process.env, fetch: globalThis.fetch, root });
  if (result.kind === "failed") {
    console.error(`stock master fetch failed: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    result.kind === "written"
      ? "stock master fetched"
      : "stock master fetch skipped (not the Production build; the synthetic master is used)",
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
