/**
 * Display formatting for decimal strings. Amounts stay strings end to end: converting to number
 * would lose digits (docs/design.md 8.4).
 */

function incrementDigits(digits: string): string {
  const result = digits.split("");
  for (let index = result.length - 1; index >= 0; index--) {
    if (result[index] !== "9") {
      result[index] = String(Number(result[index]) + 1);
      return result.join("");
    }
    result[index] = "0";
  }
  return `1${result.join("")}`;
}

/** Rounds a non-negative decimal string half up to whole yen and groups thousands. */
export function formatYen(amount: string): string | null {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(amount)) return null;
  const [integer = "0", fraction = ""] = amount.split(".");
  const rounded = fraction.charAt(0) >= "5" ? incrementDigits(integer) : integer;
  return rounded.replace(/\B(?=([0-9]{3})+$)/g, ",");
}
