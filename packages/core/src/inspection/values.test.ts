import { expect, test } from "vitest";
import { createFinding } from "../index";
import { checkHoldingsValues, checkStockCode, isDividendPerShare, isHoldingNumber } from "./values";

test.each(["9A9A", "9C9C", "9D9D", "1A0Y"])("stock code %j is accepted verbatim", (code) => {
  expect(checkStockCode(code)).toBeNull();
});

test.each([
  "",
  " 9A9A",
  "9A9A ",
  "9a9a",
  "９A９A",
  "0A9A",
  "9B9A",
  "9E9A",
  "9I9A",
  "9O9A",
  "9Q9A",
  "9V9A",
  "9Z9A",
  "9AA9",
  "9A9",
  "9A9AA",
  "9A9A\n",
  "99999\n",
])("stock code %j is invalid without correction", (code) => {
  expect(checkStockCode(code)).toBe("stock_code_invalid");
});

test("exactly five ASCII digits are unsupported rather than truncated", () => {
  expect(checkStockCode("99999")).toBe("stock_code_unsupported");
  for (const code of [" 99999", "99999 ", "９９９９９", "999999"]) {
    expect(checkStockCode(code)).toBe("stock_code_invalid");
  }
});

const validNumbers = [
  "0",
  "0.0",
  "0.0001",
  "1",
  "1234.5",
  "1,234.5",
  "1,234,567.0001",
  " 1.5 ",
  "9999999999",
  "9,999,999,999.9999",
  "9999999999.9999",
  "1.1234",
  "1.00000",
  "1.123400000",
  "0.000000",
  "0.00010",
];
const invalidNumbers = [
  "01",
  "007",
  "00.1",
  "0,000",
  "01,234",
  ".5",
  "1.",
  "+1",
  "-1",
  "1e3",
  "1E3",
  "1,23",
  "1234,567",
  ",123",
  "1,,234",
  "1 234",
  "NaN",
  "Infinity",
  "",
  "-",
  "--",
  "１２３",
  "1.00001",
  "0.00001",
  "1.12345",
  "10000000000",
  "10,000,000,000",
  "1.2.3",
  "1.2,300",
  "1\t",
  "\t1",
  "1\n",
  "1\r",
  "\u30001",
  "1\u00A0",
  "1\u0000",
];

test.each(validNumbers)("holding decimal %j is accepted without numeric conversion", (value) => {
  expect(isHoldingNumber(value)).toBe(true);
});
test.each(invalidNumbers)("holding decimal %j is invalid", (value) => {
  expect(isHoldingNumber(value)).toBe(false);
});

test.each([
  "0",
  "0.0001",
  "999999",
  "999,999.9999",
  "999999.9999",
  "1.00000",
  " 1.5 ",
  "40 ~ 50",
  "40~50",
  "40 ~50",
  "40~ 50",
  " 40  ~  50 ",
  "10 ~ 10",
  "0~0.0001",
  "9.9999~10",
  "99~100",
  "1,000~999,999",
  "1.1~1.10000",
  "1.00000~1.0001",
  "1.0099~1.01",
  "999999.9999~999999.9999000",
])("dividend %j is accepted with exact string comparison", (value) => {
  expect(isDividendPerShare(value)).toBe(true);
});
test.each([
  ...invalidNumbers,
  "1000000",
  "1,000,000",
  "50 ~ 40",
  "10~9.9999",
  "100~99",
  "1.1001~1.1",
  "1.01~1.0099",
  "40~~50",
  "40~45~50",
  "~50",
  "40~",
  "~",
  "40〜50",
  "40～50",
  "40\t~50",
  "40~\n50",
  "40~1.00001",
])("dividend %j is invalid", (value) => {
  expect(isDividendPerShare(value)).toBe(false);
});

function cells(code = "9A9A", custody = "NISA"): string[] {
  return [code, "架空銘柄", "--", custody, ...Array<string>(18).fill("0.0001")];
}

const columns = Object.freeze({
  stock_code: 0,
  holding_count: 4,
  purchase_price: 5,
  current_price: 6,
  dividend_per_share: 21,
});

test("repeated stock codes and unused custody values produce no findings", () => {
  const records = ["NISA", " NISA ", "NISA", "旧NISA", "", "架".repeat(33)].map((custody, i) => ({
    row: i + 2,
    cells: cells("9A9A", custody),
  }));
  expect(checkHoldingsValues(records, columns)).toEqual([]);
});

test("independent value errors all retain their positions without mutating records", () => {
  const invalid = Object.freeze(Array<string>(22).fill("synthetic-secret-value"));
  const records = Object.freeze([Object.freeze({ row: 4, cells: invalid })]);
  expect(checkHoldingsValues(records, columns)).toEqual([
    createFinding("stock_code_invalid", { row: 4, column: 1, field: "stock_code" }),
    createFinding("holding_count_invalid", { row: 4, column: 5, field: "holding_count" }),
    createFinding("purchase_price_invalid", { row: 4, column: 6, field: "purchase_price" }),
    createFinding("current_price_invalid", { row: 4, column: 7, field: "current_price" }),
    createFinding("dividend_per_share_invalid", {
      row: 4,
      column: 22,
      field: "dividend_per_share",
    }),
  ]);
});

test("large generated cells are bounded before repeated comma groups", () => {
  const size = 10 * 1024 * 1024;
  expect(checkStockCode(`9A9A${" ".repeat(size)}`)).toBe("stock_code_invalid");
  expect(isHoldingNumber(`1${",000".repeat(size / 4)}`)).toBe(false);
  expect(isHoldingNumber("0".repeat(size))).toBe(false);
  expect(isHoldingNumber(`1.${"0".repeat(size)}`)).toBe(true);
  expect(isHoldingNumber(`1.${"0".repeat(size)}1`)).toBe(false);
  expect(isHoldingNumber(`1${" ".repeat(size)}x`)).toBe(false);
  expect(isDividendPerShare(`1.${"0".repeat(size)}~1`)).toBe(true);
});
