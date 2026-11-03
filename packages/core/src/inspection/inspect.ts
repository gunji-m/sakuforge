import { createFinding, summarizeFindings } from "./findings";
import { checkCsvStructure } from "./structure";
import {
  DEFAULT_INSPECTION_LIMITS,
  type HoldingsInspection,
  type InspectionLimits,
  type LimitRejection,
  type StockCodeMatch,
  type StockMaster,
} from "./types";
import { checkHoldingsValues } from "./values";

export function inspectHoldingsCsv(
  input: Uint8Array | string,
  stockMaster: StockMaster,
  overrides: Partial<InspectionLimits> = {},
): LimitRejection | HoldingsInspection {
  if (!(stockMaster instanceof Map)) return { kind: "rejected", reason: "invalid_stock_master" };
  if (overrides === null || typeof overrides !== "object") {
    return { kind: "rejected", reason: "invalid_limits" };
  }
  const limits = { ...DEFAULT_INSPECTION_LIMITS, ...overrides };
  // Preserve invalid caller limits for the structure checker instead of masking them.
  if (!Number.isSafeInteger(limits.maxReturnedFindings) || limits.maxReturnedFindings < 0) {
    return { kind: "rejected", reason: "invalid_limits" };
  }
  // Keep structural findings complete until the combined summary applies the caller's limit.
  const structure = checkCsvStructure(input, {
    ...limits,
    maxReturnedFindings: Number.MAX_SAFE_INTEGER,
  });
  if (structure.kind === "rejected") return structure;
  const findings = [...structure.findings];
  if (structure.profile !== null) {
    for (const finding of checkHoldingsValues(structure.records)) findings.push(finding);
  }

  let stockCodeMatch: StockCodeMatch = { status: "not_checked" };
  if (
    structure.totalCount === 0 &&
    !findings.some(({ code }) => code === "stock_code_invalid" || code === "stock_code_unsupported")
  ) {
    const codes = new Set(structure.records.map(({ cells }) => cells[0] ?? ""));
    let unknownCodes: string[];
    try {
      unknownCodes = [...codes].filter((code) => !stockMaster.has(code)).sort();
    } catch {
      // Map wrappers can pass instanceof without supporting has(). Never expose exceptions.
      return { kind: "rejected", reason: "invalid_stock_master" };
    }
    stockCodeMatch = { status: "checked", unknownCodes, unknownCount: unknownCodes.length };
    if (unknownCodes.length > 0) findings.push(createFinding("stock_code_unknown"));
  }
  const summary = summarizeFindings(findings, limits.maxReturnedFindings);
  return {
    kind: "inspection",
    valid: summary.errorCount === 0,
    profile: structure.profile,
    encoding: structure.encoding,
    rowsScanned: structure.rowsScanned,
    ...summary,
    stockCodeMatch,
  };
}
