import * as core from "@sakuforge/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST } from "../../app/api/inspect/route";
import * as currentStockMaster from "./current-stock-master";
import { ERRORS } from "./errors";

const header =
  "銘柄,銘柄,銘柄,預り区分,保有株数,取得単価,現在値,現在値,評価損益,評価損益(%),買付金額,評価額,前日終値,前日比,前日比(%),評価額前日比,予想PER(倍),実績PBR(倍),予想配当利回り(%),予想EPS,実績BPS,予想1株配当";
const privateValues = [
  "7531",
  "2468.25",
  "8642.75",
  "37.125",
  "synthetic-holdings.csv",
  "合成例外の秘密文字列",
  header,
];
const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;

beforeEach(() => {
  for (const method of consoleMethods) vi.spyOn(console, method).mockImplementation(() => {});
});

afterEach(() => {
  try {
    for (const method of consoleMethods) expect(console[method]).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});

function csv(holdingCount = "7531", stockCode = "9A9A"): string {
  const cells = [stockCode, "合成銘柄", "--", "合成区分", ...Array<string>(18).fill("0.0001")];
  cells[4] = holdingCount;
  cells[5] = "2468.25";
  cells[6] = "8642.75";
  cells[21] = "37.125";
  return `${header}\n${cells.join(",")}`;
}

function request(
  body: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array> | null = new TextEncoder().encode(
    csv(),
  ),
  contentType: string | null = "text/csv",
): Request {
  const headers = new Headers({
    "Content-Disposition": 'attachment; filename="synthetic-holdings.csv"',
  });
  if (contentType !== null) headers.set("Content-Type", contentType);
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    headers,
    duplex: "half",
  };
  return new Request("http://localhost/api/inspect", init);
}

async function responseBody(response: Response): Promise<unknown> {
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Type")).toContain("application/json");
  const text = await response.text();
  for (const value of privateValues) expect(text).not.toContain(value);
  const body: unknown = JSON.parse(text);
  function visit(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      expect(["records", "rows", "cells", "columns"]).not.toContain(key);
      visit(child);
    }
  }
  visit(body);
  return body;
}

async function expectError(response: Response, code: keyof typeof ERRORS): Promise<void> {
  expect(response.status).toBe(ERRORS[code].status);
  expect(await responseBody(response)).toEqual({ error: { code, message: ERRORS[code].message } });
}

test.each(["text/csv", " Text/CSV ; charset=utf-8", "APPLICATION/VND.MS-EXCEL"])(
  "%sを受け付け、集計の10進値を文字列で返す",
  async (contentType) => {
    const response = await POST(request(new TextEncoder().encode(csv()), contentType));
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toMatchObject({
      result: "aggregated",
      inspection: { valid: true },
      aggregation: {
        totalAssetValue: "65088550.25",
        annualDividend: { lower: "279588.375", upper: "279588.375" },
        sector17: { sectors: [{ ratio: "100.00" }] },
        sector33: { sectors: [{ ratio: "100.00" }] },
      },
    });
  },
);

test("保有株数が不正なら検査NGを200で返す", async () => {
  const response = await POST(request(new TextEncoder().encode(csv("-7531"))));
  expect(response.status).toBe(200);
  expect(await responseBody(response)).toMatchObject({
    result: "inspection_failed",
    inspection: {
      valid: false,
      findings: [expect.objectContaining({ code: "holding_count_invalid" })],
    },
  });
});

test("未知コード一覧は核の結果のまま返す", async () => {
  const response = await POST(request(new TextEncoder().encode(csv("7531", "9D9D"))));
  expect(response.status).toBe(200);
  expect(await responseBody(response)).toMatchObject({
    result: "aggregated",
    inspection: {
      stockCodeMatch: { status: "checked", unknownCodes: ["9D9D"], unknownCount: 1 },
    },
  });
});

test("4 MiB+1 byteでcancelし、後続チャンクをpullしない", async () => {
  let pulls = 0;
  const cancel = vi.fn();
  const chunkSize = 64 * 1024;
  const fullChunks = core.DEFAULT_INSPECTION_LIMITS.maxBytes / chunkSize;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(pulls <= fullChunks ? chunkSize : 1));
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  await expectError(await POST(request(body)), "csv_too_large");
  expect(pulls).toBe(fullChunks + 1);
  expect(cancel).toHaveBeenCalledOnce();
});

test.each([null, "application/json", "text/plain", "text/csvx"])(
  "Content-Type %sは本文を読まず415で返す",
  async (contentType) => {
    const pull = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
    await expectError(await POST(request(body, contentType)), "unsupported_media_type");
    expect(pull).not.toHaveBeenCalled();
  },
);

test("列数の上限超過を422で返す", async () => {
  const input = Array<string>(core.DEFAULT_INSPECTION_LIMITS.maxColumns + 1)
    .fill("合成列")
    .join(",");
  await expectError(await POST(request(new TextEncoder().encode(input))), "csv_too_many_columns");
});

test("行数の上限超過を422で返す", async () => {
  const input = `${header}\n${"9A9A\n".repeat(core.DEFAULT_INSPECTION_LIMITS.maxDataRows + 1)}`;
  await expectError(await POST(request(new TextEncoder().encode(input))), "csv_too_many_rows");
});

test("本文の読み込み例外を固定の400にする", async () => {
  const body = new ReadableStream<Uint8Array>(
    {
      pull() {
        throw new Error("合成例外の秘密文字列");
      },
    },
    { highWaterMark: 0 },
  );
  await expectError(await POST(request(body)), "request_body_unreadable");
});

test("本文がnullなら核のcsv_emptyを返す", async () => {
  const response = await POST(request(null));
  expect(response.status).toBe(200);
  expect(await responseBody(response)).toMatchObject({
    result: "inspection_failed",
    inspection: { valid: false, findings: [expect.objectContaining({ code: "csv_empty" })] },
  });
});

test.each([
  ["maxBytes", "csv_too_large"],
  ["maxDataRows", "csv_too_many_rows"],
  ["maxColumns", "csv_too_many_columns"],
  ["invalid_input", "internal_error"],
  ["invalid_limits", "internal_error"],
  ["invalid_stock_master", "internal_error"],
] as const)("核の%sを%sに対応させる", async (reason, code) => {
  vi.spyOn(core, "inspectAndAggregateHoldingsCsv").mockReturnValueOnce({
    kind: "rejected",
    reason,
  });
  await expectError(await POST(request()), code);
});

test("集計拒否は検査の詳細を付けず固定の500にする", async () => {
  const actual = core.inspectAndAggregateHoldingsCsv(csv(), new Map());
  if (actual.kind !== "aggregated") throw new Error("合成テストデータが不正です");
  vi.spyOn(core, "inspectAndAggregateHoldingsCsv").mockReturnValueOnce({
    kind: "aggregation_rejected",
    inspection: actual.inspection,
    reason: "invalid_input",
  });
  await expectError(await POST(request()), "internal_error");
});

test("核の例外を再送出せず固定の500にする", async () => {
  vi.spyOn(core, "inspectAndAggregateHoldingsCsv").mockImplementationOnce(() => {
    throw new Error("合成例外の秘密文字列");
  });
  await expectError(await POST(request()), "internal_error");
});

test("検証に失敗した銘柄マスターでは、本文を読まず核も呼ばず固定の500にする", async () => {
  vi.spyOn(currentStockMaster, "loadCurrentStockMaster").mockReturnValueOnce({
    kind: "rejected",
    reason: "invalid_sector",
  });
  const inspect = vi.spyOn(core, "inspectAndAggregateHoldingsCsv");
  const pull = vi.fn();
  const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
  await expectError(await POST(request(body)), "internal_error");
  expect(pull).not.toHaveBeenCalled();
  expect(inspect).not.toHaveBeenCalled();
});

test("核へ渡す銘柄マスターは、検証を通ったものだけにする", async () => {
  const inspect = vi.spyOn(core, "inspectAndAggregateHoldingsCsv");
  await POST(request());
  const stockMaster = inspect.mock.calls[0]?.[1];
  expect(stockMaster).toBeInstanceOf(Map);
  expect([...(stockMaster ?? new Map()).keys()]).toEqual(["9A9A", "9C9C"]);
});
