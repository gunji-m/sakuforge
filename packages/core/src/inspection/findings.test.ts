import { expect, test } from "vitest";
import {
  createFinding,
  FINDING_CODES,
  FINDING_FIELDS,
  FINDING_MESSAGES,
  summarizeFindings,
} from "../index";

test("all 16 fixed messages and their order match domain-rules section 6", () => {
  const expected = [
    ["csv_empty", "CSVファイルが空です。保有資産のCSVを選んでください。"],
    ["csv_control_character", "CSVに使用できない文字が含まれています。"],
    ["csv_encoding_unsupported", "CSVの文字コードを読み取れません。UTF-8かShift_JISが必要です。"],
    ["csv_structure_invalid", 'CSVの形式を読み取れません。引用符（"）の対応を確認してください。'],
    [
      "csv_header_unsupported",
      "対応していない形式のCSVです。国内株式（現物）の保有資産CSVを選んでください。",
    ],
    ["csv_data_rows_empty", "保有銘柄の行がありません。"],
    ["csv_column_count_invalid", "列の数が見出しと合わない行があります。"],
    ["stock_code_invalid", "証券コードを読み取れません。4文字の証券コードが必要です。"],
    ["stock_code_unsupported", "5桁の証券コードには、まだ対応していません。"],
    ["custody_type_invalid", "預り区分を読み取れません。1〜32文字が必要です。"],
    ["holding_count_invalid", "保有株数を読み取れません。0以上の数値が必要です。"],
    ["purchase_price_invalid", "取得単価を読み取れません。0以上の数値が必要です。"],
    ["current_price_invalid", "現在値を読み取れません。0以上の数値が必要です。"],
    [
      "dividend_per_share_invalid",
      "予想1株配当を読み取れません。数値か範囲（例: 40 ~ 50）が必要です。",
    ],
    ["asset_key_duplicated", "同じ証券コードと預り区分の行が重複しています。"],
    [
      "stock_code_unknown",
      "銘柄マスターに無い証券コードがあります。該当銘柄は「未分類」として集計しました。",
    ],
  ];
  expect(FINDING_CODES.map((code) => [code, FINDING_MESSAGES[code]])).toEqual(expected);
  expect(Object.keys(FINDING_MESSAGES)).toHaveLength(16);
  for (const code of FINDING_CODES) {
    expect(createFinding(code)).toEqual({
      code,
      message: FINDING_MESSAGES[code],
      severity: code === "stock_code_unknown" ? "warning" : "error",
    });
    expect(code).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    expect(FINDING_MESSAGES[code].length).toBeLessThanOrEqual(200);
  }
});

test("the six fields and optional position properties are preserved without extra properties", () => {
  expect(FINDING_FIELDS).toEqual([
    "stock_code",
    "custody_type",
    "holding_count",
    "purchase_price",
    "current_price",
    "dividend_per_share",
  ]);
  expect(createFinding("stock_code_invalid", { row: 2, column: 1, field: "stock_code" })).toEqual({
    code: "stock_code_invalid",
    severity: "error",
    message: FINDING_MESSAGES.stock_code_invalid,
    row: 2,
    column: 1,
    field: "stock_code",
  });
});

test("sorting uses absent positions first, row, column, then table code order; duplicates include field", () => {
  const expected = [
    createFinding("csv_empty"),
    createFinding("stock_code_unknown"),
    createFinding("csv_column_count_invalid", { row: 2 }),
    createFinding("stock_code_invalid", { row: 2, column: 1, field: "stock_code" }),
    createFinding("stock_code_unsupported", { row: 2, column: 1, field: "stock_code" }),
    createFinding("custody_type_invalid", { row: 2, column: 4, field: "custody_type" }),
    createFinding("csv_column_count_invalid", { row: 4 }),
  ];
  const input = Object.freeze([...expected].reverse().concat(expected));
  const before = [...input];
  expect(summarizeFindings(input)).toEqual({
    findings: expected,
    errorCount: 6,
    warningCount: 1,
    totalCount: 7,
    returnedCount: 7,
    truncated: false,
  });
  expect(input).toEqual(before);
  expect(
    summarizeFindings([
      createFinding("stock_code_invalid", { row: 2, column: 1 }),
      createFinding("stock_code_invalid", { row: 2, column: 1, field: "stock_code" }),
    ]).totalCount,
  ).toBe(2);
});

test.each([0, 1, 2, 3, 4])("all counts remain consistent with return limit %i", (limit) => {
  const findings = [
    createFinding("csv_empty"),
    createFinding("stock_code_unknown"),
    createFinding("csv_column_count_invalid", { row: 2 }),
    createFinding("csv_empty"),
  ];
  const result = summarizeFindings(findings, limit);
  expect(result.errorCount).toBe(2);
  expect(result.warningCount).toBe(1);
  expect(result.totalCount).toBe(result.errorCount + result.warningCount);
  expect(result.returnedCount).toBe(Math.min(3, limit));
  expect(result.findings).toHaveLength(result.returnedCount);
  expect(result.truncated).toBe(result.totalCount > result.returnedCount);
});

test("the default limit is 200, while every unique finding is counted", () => {
  const findings = Array.from({ length: 205 }, (_, i) =>
    createFinding("csv_column_count_invalid", { row: i + 2 }),
  );
  expect(summarizeFindings(findings)).toMatchObject({
    totalCount: 205,
    errorCount: 205,
    warningCount: 0,
    returnedCount: 200,
    truncated: true,
  });
});

test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "invalid return limit %s fails closed",
  (limit) => {
    expect(summarizeFindings([createFinding("csv_empty")], limit)).toMatchObject({
      totalCount: 1,
      returnedCount: 0,
      truncated: true,
    });
  },
);
