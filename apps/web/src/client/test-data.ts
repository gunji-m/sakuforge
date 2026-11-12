/** Synthetic response bodies in the shape of docs/design.md 8.2, for tests only. */

type Json = Record<string, unknown>;

export function inspection(changes: Json = {}): Json {
  return {
    valid: true,
    profile: "domestic_cash_holdings_v1",
    encoding: "utf-8",
    rowsScanned: 3,
    findings: [],
    errorCount: 0,
    warningCount: 0,
    totalCount: 0,
    returnedCount: 0,
    truncated: false,
    stockCodeMatch: { status: "checked", unknownCodes: [], unknownCount: 0 },
    ...changes,
  };
}

export function composition(): Json {
  return {
    status: "computed",
    sectors: [
      { code: "1", name: "合成業種1", ratio: "93.68", held: true },
      { code: null, name: null, ratio: "6.32", held: true },
      { code: "2", name: "合成業種2", ratio: "0.00", held: false },
    ],
  };
}

export function aggregation(changes: Json = {}): Json {
  return {
    totalAssetValue: "128100",
    annualDividend: { lower: "4011", upper: "5011" },
    sector17: composition(),
    sector33: composition(),
    ...changes,
  };
}

export const stockMaster = { source: "合成データ", asOf: "2026-10-31" };

export function aggregated(changes: Json = {}): Json {
  return {
    schemaVersion: 1,
    result: "aggregated",
    inspection: inspection(),
    aggregation: aggregation(),
    stockMaster,
    ...changes,
  };
}

export const failedFinding = {
  code: "holding_count_invalid",
  severity: "error",
  message: "保有株数を読み取れません。0以上の数値が必要です。",
  row: 2,
  column: 2,
  field: "holding_count",
};

export function inspectionFailed(changes: Json = {}): Json {
  return {
    schemaVersion: 1,
    result: "inspection_failed",
    inspection: inspection({
      valid: false,
      findings: [failedFinding],
      errorCount: 1,
      totalCount: 1,
      returnedCount: 1,
    }),
    stockMaster,
    ...changes,
  };
}
