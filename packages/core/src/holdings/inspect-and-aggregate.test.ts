import { expect, test } from "vitest";
import {
  aggregateHoldings,
  type HoldingRow,
  type HoldingsCsvResult,
  inspectAndAggregateHoldingsCsv,
  inspectHoldingsCsv,
  type StockMaster,
  type StockMasterEntry,
} from "../index";

const header =
  "銘柄,銘柄,銘柄,預り区分,保有株数,取得単価,現在値,現在値,評価損益,評価損益(%),買付金額,評価額,前日終値,前日比,前日比(%),評価額前日比,予想PER(倍),実績PBR(倍),予想配当利回り(%),予想EPS,実績BPS,予想1株配当";

function entry(code: string): StockMasterEntry {
  const sector = { code, name: `合成業種${code}` };
  return { sector17: sector, sector33: sector };
}

const master: StockMaster = new Map([
  ["9A9A", entry("1")],
  ["9C9C", entry("2")],
]);

function cells(changes: Readonly<Record<number, string>> = {}): string[] {
  const result = ["9A9A", "架空銘柄", "--", "NISA", ...Array<string>(18).fill("0.0001")];
  for (const [column, value] of Object.entries(changes)) result[Number(column) - 1] = value;
  return result;
}

function csv(...rows: readonly string[][]): string {
  return [
    header,
    ...rows.map((values) =>
      values
        .map((value) => (/[,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value))
        .join(","),
    ),
  ].join("\n");
}

function utf8(text: string): Uint8Array {
  return Uint8Array.from(encodeURIComponent(text).match(/%[0-9A-F]{2}|./g) ?? [], (part) =>
    part.startsWith("%") ? Number.parseInt(part.slice(1), 16) : part.charCodeAt(0),
  );
}

function expectNoDetails(result: HoldingsCsvResult, input: string): void {
  const serialized = JSON.stringify(result);
  for (const value of ["7531", "2468.25", "8642.75", "37.125", header, input]) {
    expect(serialized).not.toContain(value);
  }
  function visit(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      expect(["records", "rows", "cells", "columns"]).not.toContain(key);
      visit(child);
    }
  }
  visit(result);
}

test("valid CSV matches direct inspection and aggregation with unchanged cell spellings", () => {
  const rows: readonly HoldingRow[] = [
    {
      stockCode: "9A9A",
      holdingCount: " 1,234.5 ",
      currentPrice: " 2.5 ",
      dividendPerShare: " 4 ~ 5 ",
    },
    { stockCode: "9C9C", holdingCount: "3", currentPrice: "100", dividendPerShare: "2" },
  ];
  const input = csv(
    ...rows.map((row) =>
      cells({
        1: row.stockCode,
        5: row.holdingCount,
        7: row.currentPrice,
        22: row.dividendPerShare,
      }),
    ),
  );
  const result = inspectAndAggregateHoldingsCsv(input, master);
  expect(result.kind).toBe("aggregated");
  if (result.kind !== "aggregated") return;
  expect(result.inspection).toEqual(inspectHoldingsCsv(input, master));
  expect(result.aggregation).toEqual(aggregateHoldings(rows, master));
});

test("unknown stock codes remain valid with a warning and aggregate as unclassified", () => {
  const input = csv(cells({ 1: "9D9D", 5: "2", 7: "100", 22: "3" }));
  const result = inspectAndAggregateHoldingsCsv(input, master);
  expect(result.kind).toBe("aggregated");
  if (result.kind !== "aggregated") return;
  expect(result.inspection).toEqual(inspectHoldingsCsv(input, master));
  expect(result.inspection.valid).toBe(true);
  expect(result.inspection.findings).toEqual([
    expect.objectContaining({ code: "stock_code_unknown", severity: "warning" }),
  ]);
  expect(result.inspection.stockCodeMatch).toEqual({
    status: "checked",
    unknownCodes: ["9D9D"],
    unknownCount: 1,
  });
  for (const axis of ["sector17", "sector33"] as const) {
    expect(result.aggregation[axis]).toEqual({
      status: "computed",
      sectors: [{ code: null, name: null, ratio: "100.00" }],
    });
  }
});

test("duplicate stock codes sum every row into one sector per axis", () => {
  const result = inspectAndAggregateHoldingsCsv(
    csv(cells({ 5: "2", 7: "100", 22: "3" }), cells({ 5: "3", 7: "200", 22: "4" })),
    master,
  );
  expect(result.kind).toBe("aggregated");
  if (result.kind !== "aggregated") return;
  expect(result.aggregation.totalAssetValue).toBe("800");
  expect(result.aggregation.annualDividend).toEqual({ lower: "18", upper: "18" });
  for (const axis of ["sector17", "sector33"] as const) {
    expect(result.aggregation[axis]).toEqual({
      status: "computed",
      sectors: [{ code: "1", name: "合成業種1", ratio: "100.00" }],
    });
  }
});

test("zero prices or holding counts yield non-computable compositions", () => {
  const result = inspectAndAggregateHoldingsCsv(
    csv(cells({ 5: "2", 7: "0" }), cells({ 1: "9C9C", 5: "0", 7: "100" })),
    master,
  );
  expect(result.kind).toBe("aggregated");
  if (result.kind !== "aggregated") return;
  expect(result.aggregation.totalAssetValue).toBe("0");
  for (const axis of ["sector17", "sector33"] as const) {
    expect(result.aggregation[axis]).toEqual({ status: "not_computable", sectors: [] });
  }
});

test("invalid values return only the failed inspection", () => {
  const input = csv(cells({ 5: "2", 7: "100" }), cells({ 5: "invalid" }));
  const result = inspectAndAggregateHoldingsCsv(input, master);
  expect(result).toEqual({
    kind: "inspection_failed",
    inspection: inspectHoldingsCsv(input, master),
  });
  expect(result).not.toHaveProperty("aggregation");
});

test("byte limit overrides return the inspection rejection without inspection or aggregation", () => {
  const input = utf8(csv(cells()));
  const overrides = { maxBytes: 1 };
  const result = inspectAndAggregateHoldingsCsv(input, master, overrides);
  expect(result).toEqual({ kind: "rejected", reason: "maxBytes" });
  expect(result).toEqual(inspectHoldingsCsv(input, master, overrides));
  expect(result).not.toHaveProperty("inspection");
  expect(result).not.toHaveProperty("aggregation");
});

test("invalid master sectors reject aggregation after a successful inspection", () => {
  const invalidMaster: StockMaster = new Map([["9A9A", entry("18")]]);
  const input = csv(cells({ 5: "2", 7: "100", 22: "3" }));
  const result = inspectAndAggregateHoldingsCsv(input, invalidMaster);
  expect(result).toEqual({
    kind: "aggregation_rejected",
    inspection: inspectHoldingsCsv(input, invalidMaster),
    reason: "invalid_stock_master",
  });
  if (result.kind !== "aggregation_rejected") return;
  expect(result.inspection.valid).toBe(true);
  expect(result).not.toHaveProperty("aggregation");
});

test("successful and failed results never expose holding details or CSV content", () => {
  for (const purchasePrice of ["2468.25", "-2468.25"]) {
    const input = csv(cells({ 5: "7531", 6: purchasePrice, 7: "8642.75", 22: "37.125" }));
    const result = inspectAndAggregateHoldingsCsv(input, master);
    expect(result.kind).toBe(purchasePrice === "2468.25" ? "aggregated" : "inspection_failed");
    expectNoDetails(result, input);
  }
});
