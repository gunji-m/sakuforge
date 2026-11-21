import { afterEach, expect, test, vi } from "vitest";
import { SUBMIT_TIMEOUT_MS, submitCsv } from "./submit";
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
  [429, "rate_limited"],
  [503, "unavailable"],
  [500, "unavailable"],
  [502, "unavailable"],
  [403, "unavailable"],
] as const)("基盤が返す %s は %s の失敗にする", async (status, reason) => {
  const respond = async () => new Response("<html>", { status });
  expect(await submitCsv(csv, respond)).toEqual({ kind: "failure", reason });
});

test("200 以外は、形の合う本文があっても結果にせず unavailable の失敗にする", async () => {
  expect(await submitCsv(csv, async () => json(aggregated(), 201))).toEqual({
    kind: "failure",
    reason: "unavailable",
  });
});

test("通信の例外は network の失敗にし、例外を外へ出さない", async () => {
  const fetcher = async () => {
    throw new TypeError("合成例外");
  };
  expect(await submitCsv(csv, fetcher)).toEqual({ kind: "failure", reason: "network" });
});

afterEach(() => {
  vi.useRealTimers();
});

/** A fetch that never answers, and rejects only when the request is aborted. */
function hangingFetch(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("合成", "AbortError")));
  });
}

test("中止の合図を付けて送る", async () => {
  const fetcher = vi.fn(async () => json(aggregated()));
  await submitCsv(csv, fetcher);
  const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.signal?.aborted).toBe(false);
});

test("時間内に応答が来なければ、送信を中止して timeout の失敗にする", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const pending = submitCsv(csv, (url, init) => {
    signal = init.signal ?? undefined;
    return hangingFetch(url, init);
  });
  await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS - 1);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal?.aborted).toBe(true);
  expect(await pending).toEqual({ kind: "failure", reason: "timeout" });
});

test("本文を読み終える前に時間が切れたら、届いた応答も結果にしない", async () => {
  vi.useFakeTimers();
  const pending = submitCsv(
    csv,
    async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener("abort", () =>
            controller.error(new DOMException("合成", "AbortError")),
          );
        },
      });
      return new Response(stream, { status: 200 });
    },
    1_000,
  );
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await pending).toEqual({ kind: "failure", reason: "timeout" });
});

test("時間内に終われば時計を残さない", async () => {
  vi.useFakeTimers();
  const outcome = await submitCsv(csv, async () => json(aggregated()));
  expect(outcome).toMatchObject({ kind: "response" });
  expect(vi.getTimerCount()).toBe(0);
});
