import { expect, test } from "vitest";
import {
  MAX_FINDINGS,
  MAX_UNKNOWN_CODES,
  parseApiError,
  parseInspectResponse,
} from "./api-response";
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
  [
    "error と warning の合計が総数と合わない",
    aggregated({ inspection: inspection({ warningCount: 1 }) }),
  ],
  [
    "検査OKなのに error の所見がある",
    aggregated({
      inspection: inspection({ findings: [failedFinding], totalCount: 1, returnedCount: 1 }),
    }),
  ],
  [
    "返した error の数が errorCount より多い",
    inspectionFailed({
      inspection: inspection({
        valid: false,
        errorCount: 1,
        warningCount: 1,
        totalCount: 2,
        returnedCount: 2,
        findings: [failedFinding, { ...failedFinding, row: 3 }],
      }),
    }),
  ],
  [
    "省略が無いのに、返した error の数が errorCount より少ない",
    inspectionFailed({
      inspection: inspection({
        valid: false,
        errorCount: 1,
        totalCount: 1,
        returnedCount: 1,
        findings: [
          { code: "stock_code_unknown", severity: "warning", message: "合成の注意の文言" },
        ],
      }),
    }),
  ],
  [
    "省略があるのに truncated が false",
    inspectionFailed({
      inspection: inspection({
        valid: false,
        errorCount: 2,
        totalCount: 2,
        returnedCount: 1,
        findings: [failedFinding],
      }),
    }),
  ],
  [
    "省略が無いのに truncated が true",
    inspectionFailed({
      inspection: inspection({
        valid: false,
        errorCount: 1,
        totalCount: 1,
        returnedCount: 1,
        truncated: true,
        findings: [failedFinding],
      }),
    }),
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

test("省略のある検査NGは、返した分が総数より少なくても受け付ける", () => {
  const parsed = parseInspectResponse(
    inspectionFailed({
      inspection: inspection({
        valid: false,
        errorCount: 249,
        warningCount: 1,
        totalCount: 250,
        returnedCount: 1,
        truncated: true,
        findings: [failedFinding],
      }),
    }),
  );
  expect(parsed).toMatchObject({ result: "inspection_failed", inspection: { truncated: true } });
});

// Upper limits the screen enforces on its own (#251): one past the limit is rejected.
function withSectors(count: number) {
  const sectors = Array.from({ length: count }, (_, index) => ({
    code: String(index + 1),
    name: `合成業種${index + 1}`,
    ratio: index === 0 ? "100.00" : "0.00",
    held: index === 0,
  }));
  return aggregated({
    aggregation: aggregation({ sector33: { status: "computed", sectors } }),
  });
}

test("業種の行は 100 件まで受け付け、101 件を拒否する", () => {
  expect(parseInspectResponse(withSectors(100))).not.toBeNull();
  expect(parseInspectResponse(withSectors(101))).toBeNull();
});

function withUnknownCodes(count: number) {
  const unknownCodes = Array.from({ length: count }, () => "9A9A");
  return aggregated({
    inspection: inspection({
      stockCodeMatch: { status: "checked", unknownCodes, unknownCount: count },
    }),
  });
}

test("未知の証券コードは MAX_UNKNOWN_CODES 件まで受け付け、1 件多い応答を拒否する", () => {
  expect(parseInspectResponse(withUnknownCodes(MAX_UNKNOWN_CODES))).not.toBeNull();
  expect(parseInspectResponse(withUnknownCodes(MAX_UNKNOWN_CODES + 1))).toBeNull();
});

const warning = {
  code: "stock_code_unknown",
  severity: "warning",
  message: "合成の固定文言",
};

function withWarnings(returned: number, total: number) {
  return aggregated({
    inspection: inspection({
      findings: Array.from({ length: returned }, () => warning),
      warningCount: total,
      totalCount: total,
      returnedCount: returned,
      truncated: returned < total,
    }),
  });
}

test("所見は MAX_FINDINGS 件まで受け付け、1 件多い応答を拒否する", () => {
  expect(parseInspectResponse(withWarnings(MAX_FINDINGS, MAX_FINDINGS))).not.toBeNull();
  expect(parseInspectResponse(withWarnings(MAX_FINDINGS + 1, MAX_FINDINGS + 1))).toBeNull();
});

test("返ってきた warning の数が warningCount を超える応答を拒否する", () => {
  // Truncated, so the totals alone agree: 2 errors in total, but 1 warning came back.
  const body = inspectionFailed({
    inspection: inspection({
      valid: false,
      findings: [warning],
      errorCount: 2,
      warningCount: 0,
      totalCount: 2,
      returnedCount: 1,
      truncated: true,
    }),
  });
  expect(parseInspectResponse(body)).toBeNull();
});

test("省略が無いのに、返ってきた error の数が errorCount と合わない応答を拒否する", () => {
  const body = inspectionFailed({
    inspection: inspection({
      valid: false,
      findings: [failedFinding, warning],
      errorCount: 2,
      warningCount: 0,
      totalCount: 2,
      returnedCount: 2,
      truncated: false,
    }),
  });
  expect(parseInspectResponse(body)).toBeNull();
});

test("返ってきた error の数が errorCount を超える応答を拒否する", () => {
  // Truncated, so every other count agrees: 1 error and 5 warnings in total, 2 errors came back.
  const body = inspectionFailed({
    inspection: inspection({
      valid: false,
      findings: [failedFinding, failedFinding],
      errorCount: 1,
      warningCount: 5,
      totalCount: 6,
      returnedCount: 2,
      truncated: true,
    }),
  });
  expect(parseInspectResponse(body)).toBeNull();
});
