import { findControlCharacter, parseCsv } from "./csv";
import { decodeCsv } from "./decode";
import { createFinding, summarizeFindings } from "./findings";
import {
  type CsvEncoding,
  DEFAULT_INSPECTION_LIMITS,
  type Finding,
  HOLDINGS_HEADER,
  HOLDINGS_PROFILE,
  type InspectionLimits,
  type StructureInspection,
  type StructureResult,
} from "./types";
import { trimAsciiSpaces } from "./values";

/** Structure only. Records are internal input to later value checks, never an API response. */
export function checkCsvStructure(
  input: Uint8Array | string,
  overrides: Partial<InspectionLimits> = {},
): StructureResult {
  if (overrides === null || typeof overrides !== "object") {
    return { kind: "rejected", reason: "invalid_limits" };
  }
  const limits = { ...DEFAULT_INSPECTION_LIMITS, ...overrides };
  if (
    !Object.values(limits).every((value) => Number.isSafeInteger(value) && value >= 0) ||
    limits.maxColumns < 1
  ) {
    return { kind: "rejected", reason: "invalid_limits" };
  }
  const result = (
    encoding: CsvEncoding,
    findings: readonly Finding[],
    rowsScanned = 0,
    profile: typeof HOLDINGS_PROFILE | null = null,
    records: StructureInspection["records"] = [],
  ): StructureInspection => ({
    kind: "structure",
    encoding,
    profile,
    records,
    rowsScanned,
    ...summarizeFindings(findings, limits.maxReturnedFindings),
  });

  const decoded = decodeCsv(input, limits.maxBytes);
  if (decoded.kind === "rejected") return decoded;
  if (decoded.kind === "unsupported") {
    return result(null, [createFinding("csv_encoding_unsupported")]);
  }
  const { text, encoding } = decoded;
  const control = findControlCharacter(text);
  if (control !== null) return result(encoding, [createFinding("csv_control_character", control)]);
  const parsed = parseCsv(text, limits);
  if (parsed.kind === "rejected") return parsed;
  if (parsed.kind === "invalid") {
    return result(
      encoding,
      [createFinding("csv_structure_invalid", { row: parsed.row })],
      parsed.rowsScanned,
    );
  }
  const [header, ...records] = parsed.records;
  const rowsScanned = records.length;
  if (header === undefined) return result(encoding, [createFinding("csv_empty")]);
  // Scan cell edges once to remove only ASCII spaces (U+0020), without normalization.
  if (
    header.cells.length !== HOLDINGS_HEADER.length ||
    !HOLDINGS_HEADER.every((expected, i) => trimAsciiSpaces(header.cells[i] ?? "") === expected)
  ) {
    return result(encoding, [createFinding("csv_header_unsupported")], rowsScanned);
  }
  if (records.length === 0) {
    return result(encoding, [createFinding("csv_data_rows_empty")], 0, HOLDINGS_PROFILE);
  }
  const findings = records
    .filter((record) => record.cells.length !== HOLDINGS_HEADER.length)
    .map((record) => createFinding("csv_column_count_invalid", { row: record.row }));
  return result(encoding, findings, rowsScanned, HOLDINGS_PROFILE, records);
}
