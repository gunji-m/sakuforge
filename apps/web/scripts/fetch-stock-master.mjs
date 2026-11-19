// @ts-check
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

/**
 * Whether this build is the Vercel Production build (Vercel sets VERCEL_ENV).
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isProductionBuild(env) {
  return env.VERCEL_ENV === "production";
}

/**
 * Reads the body, stopping as soon as it passes `limit` bytes (docs/input-trust-principles.md 2:
 * read at most the limit plus one byte). Returns null when it is larger than `limit`.
 * @param {ReadableStream<Uint8Array> | null} body
 * @param {number} limit
 * @returns {Promise<Uint8Array | null>}
 */
async function readAtMost(body, limit) {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * @param {{ env: Record<string, string | undefined>, fetch: typeof globalThis.fetch, root: string }} options
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
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { kind: "failed", reason: `http_${response.status}` };
    }
    bytes = await readAtMost(response.body, MAX_BYTES);
  } catch {
    return { kind: "failed", reason: "fetch_failed" };
  }
  if (bytes === null) return { kind: "failed", reason: "too_large" };

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
    await rm(partial, { force: true }).catch(() => {});
    return { kind: "failed", reason: "write_failed" };
  }
  return { kind: "written" };
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let result;
  try {
    result = await fetchStockMaster({ env: process.env, fetch: globalThis.fetch, root });
  } catch {
    // Never print exception text or a stack trace: they can carry paths or values.
    result = { kind: "failed", reason: "unexpected" };
  }
  if (result.kind === "failed") {
    // biome-ignore lint/suspicious/noConsole: build log of one fixed failure reason only; never the token, URL, body, or exception text.
    console.error(`stock master fetch failed: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  // biome-ignore lint/suspicious/noConsole: build log of a fixed status line only; no stock data, URL, or token.
  console.log(
    result.kind === "written"
      ? "stock master fetched"
      : "stock master fetch skipped (not the Production build; the synthetic master is used)",
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
