import type { CsvRecord, FindingPosition, InspectionLimits, LimitRejection } from "./types";

type State = "start" | "plain" | "quoted" | "closed";

function nextState(state: State, char: string): State | null {
  if (state === "quoted") return char === '"' ? "closed" : "quoted";
  if (char === "," || char === "\r" || char === "\n") return "start";
  if (char === '"') {
    if (state === "plain") return null;
    return "quoted"; // Opening quote, or the second quote of an escaped pair.
  }
  return state === "closed" ? null : "plain";
}

/** Control checks precede syntax checks; omit row if earlier malformed syntax makes it ambiguous. */
export function findControlCharacter(text: string): FindingPosition | null {
  // Cc except TAB, LF and CR (negated union avoids needing ES2024 set operations).
  const index = text.search(/[^\P{Cc}\t\n\r]/u);
  if (index === -1) return null;
  let state: State = "start";
  let line = 1;
  let row = 1;
  for (let i = 0; i < index; i++) {
    const char = text.charAt(i);
    const next = nextState(state, char);
    if (next === null) return {};
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text.charAt(i + 1) === "\n") i++;
      line++;
      if (state !== "quoted") row = line;
    }
    state = next;
  }
  return { row };
}

type CsvParseResult =
  | { readonly kind: "parsed"; readonly records: readonly CsvRecord[] }
  | { readonly kind: "invalid"; readonly row: number; readonly rowsScanned: number }
  | LimitRejection;

export function parseCsv(text: string, limits: InspectionLimits): CsvParseResult {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cellStart = 0;
  let cellParts: string[] = [];
  let state: State = "start";
  let line = 1;
  let row = 1;
  let active = false;
  const finishCell = (end: number) => {
    const tail = text.slice(cellStart, state === "closed" ? end - 1 : end);
    if (cellParts.length === 0) cells.push(tail);
    else {
      cellParts.push(tail);
      cells.push(cellParts.join(""));
      cellParts = [];
    }
  };
  const finishRecord = (end: number) => {
    if (active) {
      finishCell(end);
      records.push({ row, cells });
    }
    cells = [];
    active = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    const newline = char === "\r" || char === "\n";
    if (!active && !newline) {
      // records includes the header; reject the first character of an excess data record.
      if (records.length > limits.maxDataRows) return { kind: "rejected", reason: "maxDataRows" };
      active = true;
    }
    const next = nextState(state, char);
    if (next === null) {
      return { kind: "invalid", row, rowsScanned: Math.max(0, records.length - 1) };
    }
    if (newline) {
      const crlf = char === "\r" && text.charAt(i + 1) === "\n";
      if (state !== "quoted") finishRecord(i);
      if (crlf) i++;
      line++;
      if (state !== "quoted") {
        row = line;
        cellStart = i + 1;
      }
    } else if (char === "," && state !== "quoted") {
      if (cells.length + 2 > limits.maxColumns) return { kind: "rejected", reason: "maxColumns" };
      finishCell(i);
      cellStart = i + 1;
    } else if (char === '"' && state === "start") {
      cellStart = i + 1;
    } else if (char === '"' && state === "closed") {
      // Include the first quote of an escaped pair, then skip the second quote.
      cellParts.push(text.slice(cellStart, i));
      cellStart = i + 1;
    }
    state = next;
  }
  if (state === "quoted") {
    return { kind: "invalid", row, rowsScanned: Math.max(0, records.length - 1) };
  }
  finishRecord(text.length);
  return { kind: "parsed", records };
}
