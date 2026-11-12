import { expect, test, vi } from "vitest";
import { submitCsv } from "./submit";
import { aggregated, inspectionFailed } from "./test-data";

const csv = new Blob(["合成のCSV"]);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

test("CSV のバイト列だけを、text/csv で送る", async () => {
  const fetcher = vi.fn(async () => json(aggregated()));
  await submitCsv(csv, fetcher);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/inspect");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(csv);
  expect(init.headers).toEqual({ "Content-Type": "text/csv" });
  expect(init.cache).toBe("no-store");
  expect(init.credentials).toBe("omit");
});

test.each([
  ["aggregated", aggregated()],
  ["inspection_failed", inspectionFailed()],
])("完全な 200 の応答（%s）だけを結果にする", async (result, body) => {
  const outcome = await submitCsv(csv, async () => json(body));
  expect(outcome).toMatchObject({ kind: "response", response: { result } });
});

test.each([
  ["形の合わない 200", () => json({ schemaVersion: 1, result: "aggregated" })],
  ["知らない版の 200", () => json(aggregated({ schemaVersion: 2 }))],
  ["JSON でない 200", () => new Response("<html>", { status: 200 })],
  ["JSON でない 500", () => new Response("<html>", { status: 500 })],
  ["形の合う本文を持つ 201", () => json(aggregated(), 201)],
])("%s は invalid の失敗にする", async (_name, respond) => {
  expect(await submitCsv(csv, async () => respond())).toEqual({
    kind: "failure",
    reason: "invalid",
  });
});

test("API の誤りの応答は、code と message を返す", async () => {
  const body = {
    schemaVersion: 1,
    error: { code: "csv_too_many_rows", message: "合成の固定文言" },
  };
  expect(await submitCsv(csv, async () => json(body, 422))).toEqual({
    kind: "api_error",
    error: { code: "csv_too_many_rows", message: "合成の固定文言" },
  });
});

test.each([
  [413, "too_large"],
  [504, "timeout"],
] as const)("基盤が返す %s は %s の失敗にする", async (status, reason) => {
  const respond = async () => new Response("<html>", { status });
  expect(await submitCsv(csv, respond)).toEqual({ kind: "failure", reason });
});

test("通信の例外は network の失敗にし、例外を外へ出さない", async () => {
  const fetcher = async () => {
    throw new TypeError("合成例外");
  };
  expect(await submitCsv(csv, fetcher)).toEqual({ kind: "failure", reason: "network" });
});
