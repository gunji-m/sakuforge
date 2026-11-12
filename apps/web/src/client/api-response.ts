/**
 * The inspection API's response as the screen accepts it (docs/design.md 8.2 and 8.3).
 * Nothing is trusted: a body that does not match exactly is treated as no result.
 */

export const SUPPORTED_SCHEMA_VERSION = 1;

export interface Finding {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly row?: number;
  readonly column?: number;
  readonly field?: string;
}

export type StockCodeMatch =
  | { readonly status: "not_checked" }
  | {
      readonly status: "checked";
      readonly unknownCodes: readonly string[];
      readonly unknownCount: number;
    };

export interface Inspection {
  readonly valid: boolean;
  readonly profile: string | null;
  readonly encoding: string | null;
  readonly rowsScanned: number;
  readonly findings: readonly Finding[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly totalCount: number;
  readonly returnedCount: number;
  readonly truncated: boolean;
  readonly stockCodeMatch: StockCodeMatch;
}

export interface SectorShare {
  readonly code: string | null;
  readonly name: string | null;
  readonly ratio: string;
  readonly held: boolean;
}

export interface SectorComposition {
  readonly status: "computed" | "not_computable";
  readonly sectors: readonly SectorShare[];
}

export interface Aggregation {
  readonly totalAssetValue: string;
  readonly annualDividend: { readonly lower: string; readonly upper: string };
  readonly sector17: SectorComposition;
  readonly sector33: SectorComposition;
}

export interface StockMasterAttribution {
  readonly source: string;
  readonly asOf: string;
}

export type InspectResponse =
  | {
      readonly result: "aggregated";
      readonly inspection: Inspection;
      readonly aggregation: Aggregation;
      readonly stockMaster: StockMasterAttribution;
    }
  | {
      readonly result: "inspection_failed";
      readonly inspection: Inspection;
      readonly stockMaster: StockMasterAttribution;
    };

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

const MAX_TEXT = 200;
const MAX_FINDINGS = 200;
const MAX_UNKNOWN_CODES = 10000;
const MAX_SECTORS = 100;

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isAmount(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,39})(\.[0-9]{1,20})?$/.test(value);
}

function parseFinding(value: unknown): Finding | null {
  if (!isRecord(value)) return null;
  const { code, severity, message, row, column, field } = value;
  if (
    !isText(code, 64) ||
    !/^[a-z][a-z0-9_]*$/.test(code) ||
    (severity !== "error" && severity !== "warning") ||
    !isText(message)
  ) {
    return null;
  }
  if (
    (row !== undefined && !(isCount(row) && row >= 1)) ||
    (column !== undefined && !(isCount(column) && column >= 1)) ||
    (field !== undefined && !isText(field, 64))
  ) {
    return null;
  }
  return {
    code,
    severity,
    message,
    ...(row === undefined ? {} : { row }),
    ...(column === undefined ? {} : { column }),
    ...(field === undefined ? {} : { field }),
  };
}

function parseStockCodeMatch(value: unknown): StockCodeMatch | null {
  if (!isRecord(value)) return null;
  if (value.status === "not_checked") return { status: "not_checked" };
  const { unknownCodes, unknownCount } = value;
  if (
    value.status !== "checked" ||
    !Array.isArray(unknownCodes) ||
    unknownCodes.length > MAX_UNKNOWN_CODES ||
    !unknownCodes.every((code) => typeof code === "string" && /^[0-9A-Z]{4}$/.test(code)) ||
    unknownCount !== unknownCodes.length
  ) {
    return null;
  }
  return { status: "checked", unknownCodes: [...unknownCodes], unknownCount };
}

function parseInspection(value: unknown): Inspection | null {
  if (!isRecord(value)) return null;
  const { valid, profile, encoding, rowsScanned, findings, truncated } = value;
  const { errorCount, warningCount, totalCount, returnedCount } = value;
  if (
    typeof valid !== "boolean" ||
    !(profile === null || isText(profile, 64)) ||
    !(encoding === null || isText(encoding, 16)) ||
    !isCount(rowsScanned) ||
    !Array.isArray(findings) ||
    findings.length > MAX_FINDINGS ||
    !isCount(errorCount) ||
    !isCount(warningCount) ||
    !isCount(totalCount) ||
    !isCount(returnedCount) ||
    typeof truncated !== "boolean" ||
    returnedCount !== findings.length ||
    valid !== (errorCount === 0)
  ) {
    return null;
  }
  const parsedFindings: Finding[] = [];
  for (const finding of findings) {
    const parsed = parseFinding(finding);
    if (parsed === null) return null;
    parsedFindings.push(parsed);
  }
  const stockCodeMatch = parseStockCodeMatch(value.stockCodeMatch);
  if (stockCodeMatch === null) return null;
  return {
    valid,
    profile,
    encoding,
    rowsScanned,
    findings: parsedFindings,
    errorCount,
    warningCount,
    totalCount,
    returnedCount,
    truncated,
    stockCodeMatch,
  };
}

function parseComposition(value: unknown): SectorComposition | null {
  if (!isRecord(value) || !Array.isArray(value.sectors)) return null;
  const { status, sectors } = value;
  if (status === "not_computable") return sectors.length === 0 ? { status, sectors: [] } : null;
  if (status !== "computed" || sectors.length === 0 || sectors.length > MAX_SECTORS) return null;
  const parsed: SectorShare[] = [];
  for (const sector of sectors) {
    if (!isRecord(sector)) return null;
    const { code, name, ratio, held } = sector;
    const classified = isText(code, 4) && /^[0-9]{1,4}$/.test(code) && isText(name, 100);
    const unclassified = code === null && name === null && held === true;
    if (
      !(classified || unclassified) ||
      typeof ratio !== "string" ||
      !/^(100\.00|[0-9]{1,2}\.[0-9]{2})$/.test(ratio) ||
      typeof held !== "boolean" ||
      (!held && ratio !== "0.00")
    ) {
      return null;
    }
    parsed.push({ code: code as string | null, name: name as string | null, ratio, held });
  }
  return { status, sectors: parsed };
}

function parseAggregation(value: unknown): Aggregation | null {
  if (!isRecord(value) || !isRecord(value.annualDividend)) return null;
  const { totalAssetValue, annualDividend } = value;
  const { lower, upper } = annualDividend;
  const sector17 = parseComposition(value.sector17);
  const sector33 = parseComposition(value.sector33);
  if (
    !isAmount(totalAssetValue) ||
    !isAmount(lower) ||
    !isAmount(upper) ||
    sector17 === null ||
    sector33 === null
  ) {
    return null;
  }
  return { totalAssetValue, annualDividend: { lower, upper }, sector17, sector33 };
}

function parseStockMaster(value: unknown): StockMasterAttribution | null {
  if (!isRecord(value)) return null;
  const { source, asOf } = value;
  if (!isText(source) || typeof asOf !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(asOf)) {
    return null;
  }
  return { source, asOf };
}

/** A complete HTTP 200 body, or null when anything is missing, extra-typed or inconsistent. */
export function parseInspectResponse(value: unknown): InspectResponse | null {
  try {
    if (!isRecord(value) || value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return null;
    const inspection = parseInspection(value.inspection);
    const stockMaster = parseStockMaster(value.stockMaster);
    if (inspection === null || stockMaster === null) return null;
    if (value.result === "inspection_failed") {
      return inspection.valid || "aggregation" in value
        ? null
        : { result: "inspection_failed", inspection, stockMaster };
    }
    if (value.result !== "aggregated" || !inspection.valid) return null;
    const aggregation = parseAggregation(value.aggregation);
    return aggregation === null
      ? null
      : { result: "aggregated", inspection, aggregation, stockMaster };
  } catch {
    return null;
  }
}

/** The body of a 4xx or 5xx response from the API itself, or null. */
export function parseApiError(value: unknown): ApiError | null {
  try {
    if (!isRecord(value) || value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return null;
    const { error } = value;
    if (!isRecord(error) || !isText(error.code, 64) || !isText(error.message)) return null;
    return /^[a-z][a-z0-9_]*$/.test(error.code)
      ? { code: error.code, message: error.message }
      : null;
  } catch {
    return null;
  }
}
