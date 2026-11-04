import { createFinding } from "./findings";
import type { CsvRecord, Finding, HoldingsColumnIndexes } from "./types";

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

function decimalText(parts: DecimalParts): string {
  const fraction = parts.fraction.replace(/0+$/, "");
  return fraction === "" ? parts.integer : `${parts.integer}.${fraction}`;
}

export function parseHoldingNumber(text: string): string | null {
  const parts = decimalParts(text, 10);
  return parts === null ? null : decimalText(parts);
}

export function parseDividendPerShare(
  text: string,
): { readonly lower: string; readonly upper: string | null } | null {
  const separator = text.indexOf("~");
  if (separator === -1) {
    const parts = decimalParts(text, 6);
    return parts === null ? null : { lower: decimalText(parts), upper: null };
  }
  if (text.indexOf("~", separator + 1) !== -1) return null;
  const lower = decimalParts(text.slice(0, separator), 6);
  const upper = decimalParts(text.slice(separator + 1), 6);
  if (lower === null || upper === null) return null;
  const ordered =
    lower.integer.length !== upper.integer.length
      ? lower.integer.length < upper.integer.length
      : lower.integer !== upper.integer
        ? lower.integer < upper.integer
        : lower.fraction.padEnd(4, "0") <= upper.fraction.padEnd(4, "0");
  return ordered ? { lower: decimalText(lower), upper: decimalText(upper) } : null;
}

export function isHoldingNumber(text: string): boolean {
  return parseHoldingNumber(text) !== null;
}

export function isDividendPerShare(text: string): boolean {
  return parseDividendPerShare(text) !== null;
}

/** Only complete records reach value checks. No raw values leave this result. */
export function checkHoldingsValues(
  records: readonly CsvRecord[],
  columns: HoldingsColumnIndexes,
): readonly Finding[] {
  const findings: Finding[] = [];
  for (const { row, cells } of records) {
    const codeFinding = checkStockCode(cells[columns.stock_code] ?? "");
    if (codeFinding !== null) {
      findings.push(
        createFinding(codeFinding, { row, column: columns.stock_code + 1, field: "stock_code" }),
      );
    }
    for (const [field, findingCode] of [
      ["holding_count", "holding_count_invalid"],
      ["purchase_price", "purchase_price_invalid"],
      ["current_price", "current_price_invalid"],
    ] as const) {
      const column = columns[field] + 1;
      if (!isHoldingNumber(cells[column - 1] ?? "")) {
        findings.push(createFinding(findingCode, { row, column, field }));
      }
    }
    if (!isDividendPerShare(cells[columns.dividend_per_share] ?? "")) {
      findings.push(
        createFinding("dividend_per_share_invalid", {
          row,
          column: columns.dividend_per_share + 1,
          field: "dividend_per_share",
        }),
      );
    }
  }
  return findings;
}
