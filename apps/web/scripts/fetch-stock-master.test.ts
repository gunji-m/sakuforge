import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fetchStockMaster, MAX_BYTES, STOCK_MASTER_FILE } from "./fetch-stock-master.mjs";

const url = "https://api.github.com/repos/synthetic-owner/synthetic-repo/contents/data/x.json";
const token = "synthetic-token-value";
const env = { VERCEL_ENV: "production", STOCK_MASTER_URL: url, STOCK_MASTER_TOKEN: token };
const body = '{"schemaVersion":1,"stocks":[]}';
let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sakuforge-fetch-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function respond(text: string, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(text, init));
}

function written(): string {
  return readFileSync(join(root, STOCK_MASTER_FILE), "utf8");
}

test("本番の build では、トークンを付けて取得し、決めた場所に書く", async () => {
  const fetch = respond(body);
  expect(await fetchStockMaster({ env, fetch, root })).toEqual({ kind: "written" });
  expect(written()).toBe(body);
  const [calledUrl, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(calledUrl).toBe(url);
  const headers = new Headers(init.headers);
  expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
  expect(headers.get("Accept")).toBe("application/vnd.github.raw+json");
  expect(init.redirect).toBe("error");
});

test.each([{}, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }])(
  "本番以外（%o）では取得しない",
  async (other) => {
    const fetch = respond(body);
    expect(await fetchStockMaster({ env: other, fetch, root })).toEqual({ kind: "skipped" });
    expect(fetch).not.toHaveBeenCalled();
  },
);

test.each([
  [{ ...env, STOCK_MASTER_URL: undefined }, "url_missing_or_not_allowed"],
  [
    { ...env, STOCK_MASTER_URL: "http://api.github.com/repos/a/b/contents/x" },
    "url_missing_or_not_allowed",
  ],
  [
    { ...env, STOCK_MASTER_URL: "https://example.com/repos/a/b/contents/x" },
    "url_missing_or_not_allowed",
  ],
  [
    { ...env, STOCK_MASTER_URL: "https://api.github.com.example.com/repos/x" },
    "url_missing_or_not_allowed",
  ],
  [{ ...env, STOCK_MASTER_TOKEN: undefined }, "token_missing"],
  [{ ...env, STOCK_MASTER_TOKEN: "" }, "token_missing"],
])("設定が足りない・許さない URL なら、送らずに失敗する（%#）", async (bad, reason) => {
  const fetch = respond(body);
  expect(await fetchStockMaster({ env: bad, fetch, root })).toEqual({ kind: "failed", reason });
  expect(fetch).not.toHaveBeenCalled();
});

test.each([
  [respond("合成の本文", { status: 404 }), "http_404"],
  [respond("合成の本文", { status: 401 }), "http_401"],
  [
    vi.fn(async () => {
      throw new Error("合成例外の秘密文字列");
    }),
    "fetch_failed",
  ],
  [respond("{ 合成の壊れた JSON"), "not_json"],
  [vi.fn(async () => new Response(new Uint8Array([0x7b, 0xff, 0x7d]))), "not_json"],
  [respond(" ".repeat(MAX_BYTES + 1)), "too_large"],
])(
  "取得できない・JSON でない・大きすぎるときは失敗し、何も書かない（%#）",
  async (fetch, reason) => {
    const result = await fetchStockMaster({ env, fetch, root });
    expect(result).toEqual({ kind: "failed", reason });
    expect(() => written()).toThrow();
  },
);

test("長さの分からない大きな本文は、上限を超えた時点で読むのをやめて失敗する", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let pulled = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const fetch = vi.fn(async () => new Response(stream));
  expect(await fetchStockMaster({ env, fetch, root })).toEqual({
    kind: "failed",
    reason: "too_large",
  });
  expect(cancelled).toBe(true);
  expect(pulled).toBeLessThanOrEqual(MAX_BYTES / chunk.byteLength + 2);
  expect(() => written()).toThrow();
});

test("書き込めないときは、例外を投げず固定の理由で失敗する", async () => {
  // A regular file where the directory should be: mkdir, write and cleanup all fail.
  writeFileSync(join(root, "data"), "合成");
  expect(await fetchStockMaster({ env, fetch: respond(body), root })).toEqual({
    kind: "failed",
    reason: "write_failed",
  });
});
