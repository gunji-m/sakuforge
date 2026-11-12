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
  expect(await responseBody(response)).toEqual({
    schemaVersion: 1,
    error: { code, message: ERRORS[code].message },
  });
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

const syntheticAttribution = {
  source: "合成データ（東証のデータではありません）",
  asOf: "2026-10-31",
};

function hasKey(value: unknown, name: string): boolean {
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => key === name || hasKey(child, name));
}

test("集計できた応答は、版・検査・集計・出典と基準日だけを持ち、核の印を含めない", async () => {
  const input = [
    "銘柄,保有株数,取得単価,現在値,予想1株配当",
    "9A9A,100,1000,1200,40 ~ 50",
    "9C9C,10,700,800,1",
    "9D9D,1,90,100,1",
  ].join("\n");
  const response = await POST(request(new TextEncoder().encode(input)));
  expect(response.status).toBe(200);
  const body = await responseBody(response);
  const sectors = [
    { code: "1", name: "合成業種1", ratio: "93.68" },
    { code: "2", name: "合成業種2", ratio: "6.25" },
    { code: null, name: null, ratio: "0.08" },
  ];
  expect(body).toEqual({
    schemaVersion: 1,
    result: "aggregated",
    inspection: {
      valid: true,
      profile: "domestic_cash_holdings_v1",
      encoding: "utf-8",
      rowsScanned: 3,
      findings: [
        {
          code: "stock_code_unknown",
          severity: "warning",
          message: core.FINDING_MESSAGES.stock_code_unknown,
        },
      ],
      errorCount: 0,
      warningCount: 1,
      totalCount: 1,
      returnedCount: 1,
      truncated: false,
      stockCodeMatch: { status: "checked", unknownCodes: ["9D9D"], unknownCount: 1 },
    },
    aggregation: {
      totalAssetValue: "128100",
      annualDividend: { lower: "4011", upper: "5011" },
      sector17: { status: "computed", sectors },
      sector33: { status: "computed", sectors },
    },
    stockMaster: syntheticAttribution,
  });
  expect(hasKey(body, "kind")).toBe(false);
});

test("検査NGの応答は、集計を持たず、位置つきの所見と出典・基準日を持つ", async () => {
  const input = "銘柄,保有株数,取得単価,現在値,予想1株配当\n9A9A,-1,1000,1200,40";
  const response = await POST(request(new TextEncoder().encode(input)));
  expect(response.status).toBe(200);
  const body = await responseBody(response);
  expect(body).toEqual({
    schemaVersion: 1,
    result: "inspection_failed",
    inspection: {
      valid: false,
      profile: "domestic_cash_holdings_v1",
      encoding: "utf-8",
      rowsScanned: 1,
      findings: [
        {
          code: "holding_count_invalid",
          severity: "error",
          message: core.FINDING_MESSAGES.holding_count_invalid,
          row: 2,
          column: 2,
          field: "holding_count",
        },
      ],
      errorCount: 1,
      warningCount: 0,
      totalCount: 1,
      returnedCount: 1,
      truncated: false,
      stockCodeMatch: { status: "checked", unknownCodes: [], unknownCount: 0 },
    },
    stockMaster: syntheticAttribution,
  });
  expect(hasKey(body, "kind")).toBe(false);
});

test("照合していない検査結果は、一覧と総数を持たない", async () => {
  const response = await POST(request(null));
  expect(await responseBody(response)).toMatchObject({
    schemaVersion: 1,
    result: "inspection_failed",
    inspection: { stockCodeMatch: { status: "not_checked" } },
    stockMaster: syntheticAttribution,
  });
});

test("合計が0なら、集計できた応答のまま構成を計算不可にする", async () => {
  const input = "銘柄,保有株数,取得単価,現在値,予想1株配当\n9A9A,0,1000,1200,40";
  const response = await POST(request(new TextEncoder().encode(input)));
  expect(await responseBody(response)).toMatchObject({
    result: "aggregated",
    aggregation: {
      totalAssetValue: "0",
      sector17: { status: "not_computable", sectors: [] },
      sector33: { status: "not_computable", sectors: [] },
    },
  });
});

test("核が項目を足しても、決めた項目だけを応答に写す", async () => {
  const actual = core.inspectAndAggregateHoldingsCsv(csv(), new Map());
  if (actual.kind !== "aggregated") throw new Error("合成テストデータが不正です");
  vi.spyOn(core, "inspectAndAggregateHoldingsCsv").mockReturnValueOnce({
    kind: "aggregated",
    inspection: { ...actual.inspection, records: [["合成例外の秘密文字列"]] } as never,
    aggregation: { ...actual.aggregation, rows: [{ holdingCount: "7531" }] } as never,
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  const body = await responseBody(response);
  expect(hasKey(body, "records")).toBe(false);
  expect(hasKey(body, "rows")).toBe(false);
});
