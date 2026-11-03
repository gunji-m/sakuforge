import { createFinding } from "./findings";
import { type CsvRecord, type Finding, HOLDINGS_HEADER } from "./types";

export function trimAsciiSpaces(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charAt(start) === " ") start++;
  while (end > start && text.charAt(end - 1) === " ") end--;
  return text.slice(start, end);
}

export function checkStockCode(
  code: string,
): "stock_code_invalid" | "stock_code_unsupported" | null {
  if (
    code.length === 4 &&
    /^[1-9][0-9ACDFGHJKLMNPRSTUWXY][0-9][0-9ACDFGHJKLMNPRSTUWXY]$/.test(code)
  )
    return null;
  return code.length === 5 && /^[0-9]{5}$/.test(code)
    ? "stock_code_unsupported"
    : "stock_code_invalid";
}

/** A normalized identifier component, or null. Stop counting at the first excess code point. */
export function checkCustodyType(text: string): string | null {
  const custody = trimAsciiSpaces(text);
  let length = 0;
  for (const char of custody) {
    if (++length > 32 || /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u.test(char)) return null;
  }
  return length === 0 ? null : custody;
}

interface DecimalParts {
  readonly integer: string;
  readonly fraction: string;
}

/** Check the original spelling; retain at most four fractional digits after validation. */
function decimalParts(text: string, maxIntegerDigits: number): DecimalParts | null {
  const value = trimAsciiSpaces(text);
  const [integer = "", fraction = ""] = value.replaceAll(",", "").split(".");
  // Bound the repeated comma groups before regex matching, even for multi-MiB cells.
  if (integer.length > maxIntegerDigits || /[1-9]/.test(fraction.slice(4))) return null;
  if (
    /[^0-9,.]/.test(value) ||
    (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) &&
      !/^[1-9][0-9]{0,2}(,[0-9]{3})+(\.[0-9]+)?$/.test(value))
  )
    return null;
  return { integer, fraction: fraction.slice(0, 4) };
}

export function isHoldingNumber(text: string): boolean {
  return decimalParts(text, 10) !== null;
}

export function isDividendPerShare(text: string): boolean {
  const separator = text.indexOf("~");
  if (separator === -1) return decimalParts(text, 6) !== null;
  if (text.indexOf("~", separator + 1) !== -1) return false;
  const lower = decimalParts(text.slice(0, separator), 6);
  const upper = decimalParts(text.slice(separator + 1), 6);
  if (lower === null || upper === null) return false;
  if (lower.integer.length !== upper.integer.length) {
    return lower.integer.length < upper.integer.length;
  }
  if (lower.integer !== upper.integer) return lower.integer < upper.integer;
  return lower.fraction.padEnd(4, "0") <= upper.fraction.padEnd(4, "0");
}

/** Only complete records reach value and identifier checks. No raw values leave this result. */
export function checkHoldingsValues(records: readonly CsvRecord[]): readonly Finding[] {
  const findings: Finding[] = [];
  const identifiers = new Map<string, Set<string>>();
  for (const { row, cells } of records) {
    if (cells.length !== HOLDINGS_HEADER.length) continue;
    const code = cells[0] ?? "";
    const codeFinding = checkStockCode(code);
    const custody = checkCustodyType(cells[3] ?? "");
    if (codeFinding !== null) {
      findings.push(createFinding(codeFinding, { row, column: 1, field: "stock_code" }));
    }
    if (custody === null) {
      findings.push(
        createFinding("custody_type_invalid", { row, column: 4, field: "custody_type" }),
      );
    }
    for (const [column, field, findingCode] of [
      [5, "holding_count", "holding_count_invalid"],
      [6, "purchase_price", "purchase_price_invalid"],
      [7, "current_price", "current_price_invalid"],
    ] as const) {
      if (!isHoldingNumber(cells[column - 1] ?? "")) {
        findings.push(createFinding(findingCode, { row, column, field }));
      }
    }
    if (!isDividendPerShare(cells[21] ?? "")) {
      findings.push(
        createFinding("dividend_per_share_invalid", {
          row,
          column: 22,
          field: "dividend_per_share",
        }),
      );
    }
    if (codeFinding === null && custody !== null) {
      const custodies = identifiers.get(code) ?? new Set<string>();
      if (custodies.has(custody)) findings.push(createFinding("asset_key_duplicated", { row }));
      else custodies.add(custody);
      identifiers.set(code, custodies);
    }
  }
  return findings;
}
