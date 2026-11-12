import { expect, test } from "vitest";
import { parseApiError, parseInspectResponse } from "./api-response";
import {
  aggregated,
  aggregation,
  composition,
  failedFinding,
  inspection,
  inspectionFailed,
} from "./test-data";

test("設計 8.2 の形の応答を、そのままの値で受け付ける", () => {
  const body = aggregated();
  const { schemaVersion: _, ...expected } = body;
  expect(parseInspectResponse(body)).toEqual(expected);
});

test("検査NGの応答を、集計なしで受け付ける", () => {
  const body = inspectionFailed();
  const { schemaVersion: _, ...expected } = body;
  expect(parseInspectResponse(body)).toEqual(expected);
});

test("照合していない検査結果と、計算不可の構成を受け付ける", () => {
  const notComputable = { status: "not_computable", sectors: [] };
  const parsed = parseInspectResponse(
    aggregated({
      inspection: inspection({ stockCodeMatch: { status: "not_checked" } }),
      aggregation: aggregation({
        totalAssetValue: "0",
        sector17: notComputable,
        sector33: notComputable,
      }),
    }),
  );
  expect(parsed).toMatchObject({
    inspection: { stockCodeMatch: { status: "not_checked" } },
    aggregation: { sector17: notComputable, sector33: notComputable },
  });
});

test("決めた項目だけを取り出し、余分な項目を結果に持ち込まない", () => {
  const parsed = parseInspectResponse(
    aggregated({
      extra: "合成の余分な値",
      inspection: inspection({ records: [["合成の余分な値"]] }),
      aggregation: aggregation({ rows: [{ holdingCount: "7531" }] }),
    }),
  );
  expect(parsed).not.toBeNull();
  expect(JSON.stringify(parsed)).not.toContain("合成の余分な値");
  expect(JSON.stringify(parsed)).not.toContain("7531");
});

const sector = { code: "1", name: "合成業種1", ratio: "100.00", held: true };
const withSector = (changes: object) =>
  aggregated({
    aggregation: aggregation({
      sector17: { status: "computed", sectors: [{ ...sector, ...changes }] },
    }),
  });

test.each([
  ["null", null],
  ["配列", []],
  ["文字列", "合成文字列"],
  ["知らない版", aggregated({ schemaVersion: 2 })],
  ["版が無い", { ...aggregated(), schemaVersion: undefined }],
  ["知らない result", aggregated({ result: "rejected" })],
  ["集計が無い", { ...aggregated(), aggregation: undefined }],
  ["出典が無い", { ...aggregated(), stockMaster: undefined }],
  ["基準日の形が違う", aggregated({ stockMaster: { source: "合成データ", asOf: "2026/10/31" } })],
  ["出典が空", aggregated({ stockMaster: { source: "", asOf: "2026-10-31" } })],
  ["検査NGなのに集計できた扱い", aggregated({ inspection: inspectionFailed().inspection })],
  ["検査NGに集計が付いている", inspectionFailed({ aggregation: aggregation() })],
  ["検査OKなのに検査NGの扱い", inspectionFailed({ inspection: inspection() })],
  ["valid と errorCount の食い違い", aggregated({ inspection: inspection({ errorCount: 1 }) })],
  [
    "所見の数と returnedCount の食い違い",
    aggregated({ inspection: inspection({ returnedCount: 1 }) }),
  ],
  ["件数が負", aggregated({ inspection: inspection({ rowsScanned: -1 }) })],
  ["件数が文字列", aggregated({ inspection: inspection({ rowsScanned: "3" }) })],
  [
    "所見の severity が違う",
    inspectionFailed({
      inspection: inspection({
        valid: false,
        errorCount: 1,
        totalCount: 1,
        returnedCount: 1,
        findings: [{ ...failedFinding, severity: "fatal" }],
      }),
    }),
  ],
  [
    "所見の行番号が 0",
    inspectionFailed({
      inspection: inspection({
        valid: false,
        errorCount: 1,
        totalCount: 1,
        returnedCount: 1,
        findings: [{ ...failedFinding, row: 0 }],
      }),
    }),
  ],
  [
    "未知コードの数の食い違い",
    aggregated({
      inspection: inspection({
        stockCodeMatch: { status: "checked", unknownCodes: ["9D9D"], unknownCount: 2 },
      }),
    }),
  ],
  [
    "未知コードの形が違う",
    aggregated({
      inspection: inspection({
        stockCodeMatch: { status: "checked", unknownCodes: ["<b>"], unknownCount: 1 },
      }),
    }),
  ],
  ["金額が数値", aggregated({ aggregation: aggregation({ totalAssetValue: 128100 }) })],
  ["金額が指数表記", aggregated({ aggregation: aggregation({ totalAssetValue: "1e5" }) })],
  ["金額が負", aggregated({ aggregation: aggregation({ totalAssetValue: "-1" }) })],
  [
    "配当の上限が無い",
    aggregated({ aggregation: aggregation({ annualDividend: { lower: "1" } }) }),
  ],
  ["構成比が 100 を超える", withSector({ ratio: "100.01" })],
  ["構成比の小数が 1 桁", withSector({ ratio: "50.0" })],
  ["held が無い", withSector({ held: undefined })],
  ["保有なしなのに構成比がある", withSector({ ratio: "1.00", held: false })],
  ["業種コードが数字でない", withSector({ code: "1A" })],
  ["業種名だけ null", withSector({ name: null })],
  ["未分類が保有なし", withSector({ code: null, name: null, ratio: "0.00", held: false })],
  [
    "computed なのに業種が空",
    aggregated({ aggregation: aggregation({ sector33: { status: "computed", sectors: [] } }) }),
  ],
  [
    "not_computable なのに業種がある",
    aggregated({
      aggregation: aggregation({ sector33: { ...composition(), status: "not_computable" } }),
    }),
  ],
])("形の合わない応答（%s）を結果にしない", (_name, body) => {
  expect(parseInspectResponse(body)).toBeNull();
});

test("例外を投げる値も、結果にしないだけで済ませる", () => {
  const hostile = new Proxy(aggregated(), {
    get() {
      throw new Error("合成例外");
    },
  });
  expect(parseInspectResponse(hostile)).toBeNull();
  expect(parseApiError(hostile)).toBeNull();
});

test("誤りの応答（設計 8.3）から、code と message だけを取り出す", () => {
  expect(
    parseApiError({
      schemaVersion: 1,
      error: { code: "csv_too_large", message: "合成の固定文言", extra: "合成の余分な値" },
    }),
  ).toEqual({ code: "csv_too_large", message: "合成の固定文言" });
});

test.each([
  null,
  "合成文字列",
  { error: { code: "csv_too_large", message: "合成の固定文言" } },
  { schemaVersion: 2, error: { code: "csv_too_large", message: "合成の固定文言" } },
  { schemaVersion: 1, error: { code: "CSV TOO LARGE", message: "合成の固定文言" } },
  { schemaVersion: 1, error: { code: "csv_too_large", message: "" } },
  { schemaVersion: 1, error: { code: "csv_too_large", message: "あ".repeat(201) } },
  { schemaVersion: 1, error: "csv_too_large" },
])("形の合わない誤りの応答 %j を受け付けない", (body) => {
  expect(parseApiError(body)).toBeNull();
});
