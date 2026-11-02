import {
  DEFAULT_INSPECTION_LIMITS,
  FINDING_CODES,
  FINDING_MESSAGES,
  type Finding,
  type FindingCode,
  type FindingPosition,
  type FindingSummary,
} from "./types";

export function createFinding(code: FindingCode, position: FindingPosition = {}): Finding {
  const { row, column, field } = position;
  return {
    code,
    severity: code === "stock_code_unknown" ? "warning" : "error",
    message: FINDING_MESSAGES[code],
    ...(row === undefined ? {} : { row }),
    ...(column === undefined ? {} : { column }),
    ...(field === undefined ? {} : { field }),
  };
}

/** Deduplicate and count ALL findings before applying the return limit. Does not mutate input. */
export function summarizeFindings(
  findings: readonly Finding[],
  maxReturnedFindings = DEFAULT_INSPECTION_LIMITS.maxReturnedFindings,
): FindingSummary {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    const { code, row, column, field } = finding;
    const key = JSON.stringify([code, row, column, field]);
    unique.set(key, createFinding(code, finding));
  }
  const sorted = [...unique.values()].sort(
    (a, b) =>
      (a.row ?? 0) - (b.row ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      FINDING_CODES.indexOf(a.code) - FINDING_CODES.indexOf(b.code),
  );
  const totalCount = sorted.length;
  const warningCount = sorted.filter((finding) => finding.severity === "warning").length;
  // Invalid caller configuration fails closed rather than accidentally returning unlimited findings.
  const limit =
    Number.isSafeInteger(maxReturnedFindings) && maxReturnedFindings >= 0 ? maxReturnedFindings : 0;
  const returned = sorted.slice(0, limit);
  return {
    findings: returned,
    errorCount: totalCount - warningCount,
    warningCount,
    totalCount,
    returnedCount: returned.length,
    truncated: totalCount > returned.length,
  };
}
