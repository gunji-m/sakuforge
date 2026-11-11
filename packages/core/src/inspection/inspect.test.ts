import { expect, test } from "vitest";
import {
  createFinding,
  DEFAULT_INSPECTION_LIMITS,
  FINDING_MESSAGES,
  HOLDINGS_PROFILE,
  type HoldingsInspection,
  type InspectionLimits,
  inspectHoldingsCsv,
  type StockMaster,
  type StockMasterEntry,
} from "../index";
import { checkCsvStructure } from "./structure";

const header =
  "銘柄,銘柄,銘柄,預り区分,保有株数,取得単価,現在値,現在値,評価損益,評価損益(%),買付金額,評価額,前日終値,前日比,前日比(%),評価額前日比,予想PER(倍),実績PBR(倍),予想配当利回り(%),予想EPS,実績BPS,予想1株配当";
const entry: StockMasterEntry = Object.freeze({ sector17: null, sector33: null });
const master: StockMaster = new Map([["9A9A", entry]]);

function cells(changes: Readonly<Record<number, string>> = {}): string[] {
  const result = ["9A9A", "架空銘柄", "--", "NISA", ...Array<string>(18).fill("0.0001")];
  for (const [column, value] of Object.entries(changes)) result[Number(column) - 1] = value;
  return result;
}

function record(values = cells()): string {
  return values
    .map((value) => (/[,"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value))
    .join(",");
}

function csv(...rows: readonly string[][]): string {
  return [header, ...rows.map(record)].join("\n");
}

function inspected(
  input: string | Uint8Array,
  stockMaster: StockMaster = master,
  limits?: Partial<InspectionLimits>,
): HoldingsInspection {
  const result = inspectHoldingsCsv(input, stockMaster, limits);
  if (result.kind !== "inspection") throw new Error("Expected inspection result");
  expect(result).not.toHaveProperty("records");
  expect(result).not.toHaveProperty("columns");
  expect(result.errorCount + result.warningCount).toBe(result.totalCount);
  expect(result.returnedCount).toBe(result.findings.length);
  expect(result.truncated).toBe(result.totalCount > result.returnedCount);
  expect(result.valid).toBe(result.errorCount === 0);
  for (const finding of result.findings)
    expect(finding.message).toBe(FINDING_MESSAGES[finding.code]);
  return result;
}

test("valid holdings allow different custodies, ranges, unused missing values and quoted commas", () => {
  expect(
    inspected(
      csv(
        cells({ 5: "1,234.5", 6: " 1,234.5 ", 7: "1,234.5", 8: "--", 22: "40 ~ 50" }),
        cells({ 4: "旧NISA" }),
      ),
    ),
  ).toEqual({
    kind: "inspection",
    valid: true,
    profile: HOLDINGS_PROFILE,
    encoding: null,
    rowsScanned: 2,
    findings: [],
    errorCount: 0,
    warningCount: 0,
    totalCount: 0,
    returnedCount: 0,
    truncated: false,
    stockCodeMatch: { status: "checked", unknownCodes: [], unknownCount: 0 },
  });
});

const requiredIndexes = [0, 4, 5, 6, 21];
const reorderedIndexes = [21, 6, 4, 0, 5];

test.each([
  [
    "additional and duplicate unused headings",
    [...Array.from({ length: 22 }, (_, i) => i), 22, 3, 3],
  ],
  ["missing custody heading", Array.from({ length: 22 }, (_, i) => i).filter((i) => i !== 3)],
  ["only the five required headings", requiredIndexes],
  ["reordered required headings", reorderedIndexes],
  ["reordered 22 headings", [21, ...Array.from({ length: 21 }, (_, i) => i)]],
] as const)("%s preserves inspection results", (_name, indexes) => {
  const headings = [...header.split(","), "synthetic-secret-header"];
  for (const code of ["9A9A", "9C9C"]) {
    const rows = [
      cells({ 1: code, 23: "synthetic-secret-value" }),
      cells({ 1: code, 4: "旧NISA", 23: "synthetic-secret-value" }),
    ];
    const input = [
      record(indexes.map((i) => headings[i] ?? "")),
      ...rows.map((row) => record(indexes.map((i) => row[i] ?? ""))),
    ].join("\n");
    expect(inspected(input)).toEqual(inspected(csv(...rows.map((row) => row.slice(0, 22)))));
  }
});

test("reordered invalid values report their actual columns and stable fields", () => {
  const headings = header.split(",");
  const input = [
    record(reorderedIndexes.map((i) => headings[i] ?? "")),
    record(Array<string>(5).fill("synthetic-secret-value")),
  ].join("\n");
  const result = inspected(input);
  expect(result.findings).toEqual([
    createFinding("dividend_per_share_invalid", { row: 2, column: 1, field: "dividend_per_share" }),
    createFinding("current_price_invalid", { row: 2, column: 2, field: "current_price" }),
    createFinding("holding_count_invalid", { row: 2, column: 3, field: "holding_count" }),
    createFinding("stock_code_invalid", { row: 2, column: 4, field: "stock_code" }),
    createFinding("purchase_price_invalid", { row: 2, column: 5, field: "purchase_price" }),
  ]);
  expect(result.stockCodeMatch).toEqual({ status: "not_checked" });
});

test.each([false, true])(
  "duplicate stock and current price headings use the first, invalid=%s",
  (invalid) => {
    const input = [
      "銘柄,保有株数,取得単価,現在値,予想1株配当, 銘柄 , 現在値 ",
      record(
        invalid
          ? ["bad", "0", "0", "--", "0", "9A9A", "0"]
          : ["9A9A", "0", "0", "0", "0", "bad", "--"],
      ),
    ].join("\n");
    const result = inspected(input);
    expect(result.valid).toBe(!invalid);
    expect(result.findings).toEqual(
      invalid
        ? [
            createFinding("stock_code_invalid", { row: 2, column: 1, field: "stock_code" }),
            createFinding("current_price_invalid", { row: 2, column: 4, field: "current_price" }),
          ]
        : [],
    );
  },
);

test.each([4, 6])(
  "rows with %i cells do not match a five-column header or receive value findings",
  (width) => {
    const input = [
      "銘柄,保有株数,取得単価,現在値,予想1株配当",
      record(Array<string>(width).fill("synthetic-secret-value")),
      "9A9A,0,0,0,0",
    ].join("\n");
    expect(inspected(input)).toMatchObject({
      valid: false,
      rowsScanned: 2,
      totalCount: 1,
      findings: [createFinding("csv_column_count_invalid", { row: 2 })],
      stockCodeMatch: { status: "not_checked" },
    });
  },
);

test("swapped headings with unchanged cells fail value checks instead of being corrected", () => {
  const headings = header.split(",");
  headings[0] = "保有株数";
  headings[4] = "銘柄";
  expect(inspected(`${record(headings)}\n${record(cells())}`)).toMatchObject({
    profile: HOLDINGS_PROFILE,
    valid: false,
    findings: [
      createFinding("holding_count_invalid", { row: 2, column: 1, field: "holding_count" }),
      createFinding("stock_code_invalid", { row: 2, column: 2, field: "stock_code" }),
    ],
    stockCodeMatch: { status: "not_checked" },
  });
});

test.each([
  ["", "csv_empty", undefined],
  [`${header}\nsynthetic\u0000cell`, "csv_control_character", 2],
  [new Uint8Array([0x81]), "csv_encoding_unsupported", undefined],
  [`${header}\n"synthetic`, "csv_structure_invalid", 2],
  ["synthetic-secret-header", "csv_header_unsupported", undefined],
  [header, "csv_data_rows_empty", undefined],
  [`${header}\nsynthetic-secret-value`, "csv_column_count_invalid", 2],
] as const)(
  "each structural finding retains its position and prevents matching",
  (input, code, row) => {
    const result = inspected(input);
    expect(result.findings).toEqual([createFinding(code, row === undefined ? {} : { row })]);
    expect(result).toMatchObject({
      valid: false,
      totalCount: 1,
      errorCount: 1,
      warningCount: 0,
      stockCodeMatch: { status: "not_checked" },
    });
  },
);

test.each([
  [1, "synthetic-secret-value", "stock_code_invalid", "stock_code"],
  [1, "99999", "stock_code_unsupported", "stock_code"],
  [5, "synthetic-secret-value", "holding_count_invalid", "holding_count"],
  [6, "synthetic-secret-value", "purchase_price_invalid", "purchase_price"],
  [7, "synthetic-secret-value", "current_price_invalid", "current_price"],
  [22, "synthetic-secret-value", "dividend_per_share_invalid", "dividend_per_share"],
] as const)(
  "each value finding has exactly row, column and field",
  (column, value, code, field) => {
    const result = inspected(csv(cells({ [column]: value })));
    expect(result.findings).toEqual([createFinding(code, { row: 2, column, field })]);
    expect(result).toMatchObject({ valid: false, totalCount: 1, errorCount: 1, warningCount: 0 });
    expect(result.stockCodeMatch.status).toBe(column === 1 ? "not_checked" : "checked");
  },
);

test("repeated stock codes are valid with identical or different custody values", () => {
  const result = inspected(csv(cells(), cells({ 4: " NISA " }), cells(), cells({ 4: "旧NISA" })));
  expect(result).toMatchObject({
    valid: true,
    rowsScanned: 4,
    errorCount: 0,
    warningCount: 0,
    totalCount: 0,
    findings: [],
    stockCodeMatch: { status: "checked", unknownCodes: [], unknownCount: 0 },
  });
});

test("unknown warning has no position, is emitted once and does not invalidate holdings", () => {
  const result = inspected(
    csv(cells({ 1: "9D9D" }), cells({ 1: "9C9C" }), cells({ 1: "9D9D", 4: "旧NISA" })),
  );
  expect(result.findings).toEqual([createFinding("stock_code_unknown")]);
  expect(result).toMatchObject({
    valid: true,
    errorCount: 0,
    warningCount: 1,
    totalCount: 1,
    stockCodeMatch: { status: "checked", unknownCodes: ["9C9C", "9D9D"], unknownCount: 2 },
  });
});

test("unused columns are not validated, including allowed structural whitespace", () => {
  const unused = Object.fromEntries(
    [2, 3, 4, ...Array.from({ length: 14 }, (_, i) => i + 8)].map((column) => [column, "--\t\n"]),
  );
  expect(inspected(csv(cells(unused))).findings).toEqual([]);
});

test("independent errors coexist and positions use record start physical rows", () => {
  const input = `\n${header}\n${record(cells({ 2: "架空\n銘柄" }))}\n\n${record(cells({ 4: "旧NISA", 5: "--", 7: "--" }))}`;
  expect(inspected(input).findings).toEqual([
    createFinding("holding_count_invalid", { row: 6, column: 5, field: "holding_count" }),
    createFinding("current_price_invalid", { row: 6, column: 7, field: "current_price" }),
  ]);
});

test.each(["", " ", "架".repeat(33), "\t", "\n", "\r", "\u202A", "\u202E", "\u2066", "\u2069"])(
  "unused custody %j is not validated",
  (custody) => {
    expect(inspected(csv(cells({ 4: custody }))).valid).toBe(true);
  },
);

test("invalid code rows each retain their value finding", () => {
  const result = inspected(csv(cells({ 1: "invalid" }), cells({ 1: "invalid" })));
  expect(result.findings.map(({ code }) => code)).toEqual([
    "stock_code_invalid",
    "stock_code_invalid",
  ]);
});

test.each([[cells().slice(0, 21)], [[...cells(), "--"]]])(
  "wrong-width records do not receive value findings",
  (badCells) => {
    badCells[4] = "--";
    const result = inspected(csv(badCells, cells()));
    expect(result.findings).toEqual([createFinding("csv_column_count_invalid", { row: 2 })]);
    expect(result.stockCodeMatch).toEqual({ status: "not_checked" });
  },
);

test("valid-width records still receive value checks alongside column errors", () => {
  expect(inspected(`${header}\nbad\n${record(cells({ 5: "--" }))}`).findings).toEqual([
    createFinding("csv_column_count_invalid", { row: 2 }),
    createFinding("holding_count_invalid", { row: 3, column: 5, field: "holding_count" }),
  ]);
});

test.each([
  csv(cells({ 1: "invalid" }), cells({ 1: "9C9C" })),
  csv(cells({ 1: "99999" }), cells({ 1: "9C9C" })),
  `${header}\nbad\n${record(cells({ 1: "9C9C" }))}`,
  `synthetic-secret-header\n${record(cells({ 1: "9C9C", 5: "--" }))}`,
])("structural or code errors disable all matching, including hidden findings", (input) => {
  for (const maxReturnedFindings of [0, 1, 200]) {
    const result = inspected(input, master, { maxReturnedFindings });
    expect(result.stockCodeMatch).toEqual({ status: "not_checked" });
    expect(result.warningCount).toBe(0);
  }
});

test("matching proceeds despite numeric errors and repeated codes", () => {
  const result = inspected(
    csv(cells({ 1: "9C9C", 5: "--" }), cells({ 1: "9C9C" }), cells({ 4: "" })),
  );
  expect(result.findings.map(({ code }) => code)).toEqual([
    "stock_code_unknown",
    "holding_count_invalid",
  ]);
  expect(result.stockCodeMatch).toEqual({
    status: "checked",
    unknownCodes: ["9C9C"],
    unknownCount: 1,
  });
});

test("all 201 unknown codes are returned independently of the findings limit", () => {
  const letters = "ACDFGHJKLMNPRSTUWXY";
  const codes: string[] = [];
  for (const second of letters) {
    for (const fourth of letters) codes.push(`9${second}9${fourth}`);
  }
  const unknown = codes.slice(0, 201).reverse();
  const input = csv(
    ...unknown.map((code) => cells({ 1: code })),
    cells({ 1: unknown[0] ?? "", 4: "旧NISA" }),
  );
  for (const maxReturnedFindings of [0, 1, 200]) {
    const result = inspected(input, new Map(), { maxReturnedFindings });
    expect(result.stockCodeMatch).toEqual({
      status: "checked",
      unknownCodes: [...unknown].sort(),
      unknownCount: 201,
    });
    expect(result).toMatchObject({ valid: true, totalCount: 1, warningCount: 1, errorCount: 0 });
  }
});

test.each([0, 1, 2, 200])(
  "combined counts and validity precede the return limit %i",
  (maxReturnedFindings) => {
    const result = inspected(
      `${header}\nbad\n${record(cells({ 5: "--", 7: "--" }))}\nalso-bad`,
      master,
      { maxReturnedFindings },
    );
    expect(result).toMatchObject({
      valid: false,
      totalCount: 4,
      errorCount: 4,
      warningCount: 0,
      returnedCount: Math.min(4, maxReturnedFindings),
    });
    expect(result.stockCodeMatch).toEqual({ status: "not_checked" });
    const warningFirst = inspected(csv(cells({ 1: "9C9C", 5: "--" })), master, {
      maxReturnedFindings,
    });
    expect(warningFirst).toMatchObject({
      valid: false,
      errorCount: 1,
      warningCount: 1,
      totalCount: 2,
    });
    if (maxReturnedFindings === 1)
      expect(warningFirst.findings).toEqual([createFinding("stock_code_unknown")]);
  },
);

test("default return limit keeps counting all structural and value findings", () => {
  const input = [
    header,
    ...Array.from({ length: 205 }, () => "bad"),
    record(cells({ 5: "--" })),
  ].join("\n");
  expect(inspected(input)).toMatchObject({
    rowsScanned: 206,
    totalCount: 206,
    errorCount: 206,
    returnedCount: 200,
    truncated: true,
    valid: false,
  });
});

test("serialization contains no raw cells, unsupported header, records or sector contents", () => {
  for (const input of [
    csv(
      cells({
        1: "synthetic-secret-value",
        2: "synthetic-secret-name",
        4: "\t",
        5: "synthetic-secret-amount",
      }),
    ),
    `synthetic-secret-header\n${record(cells({ 5: "synthetic-secret-value" }))}`,
  ]) {
    const serialized = JSON.stringify(inspected(input));
    for (const secret of [
      "synthetic-secret-value",
      "synthetic-secret-header",
      "synthetic-secret-name",
      "synthetic-secret-amount",
      header,
    ]) {
      expect(serialized).not.toContain(secret);
    }
  }
});

test("master entries are never read or modified; matching uses only has", () => {
  const guardedEntry: StockMasterEntry = {
    get sector17(): StockMasterEntry["sector17"] {
      throw new Error("Must not read sectors");
    },
    get sector33(): StockMasterEntry["sector33"] {
      throw new Error("Must not read sectors");
    },
  };
  const guardedMaster = new Map([["9A9A", guardedEntry]]);
  guardedMaster.get = () => {
    throw new Error("Must not read entries");
  };
  const input = csv(cells());
  expect(inspected(input, guardedMaster)).toEqual(inspected(input, guardedMaster));
  expect(guardedMaster.size).toBe(1);
});

test("failed master membership checks return a fixed rejection without exception details", () => {
  const failingMaster = new Map<string, StockMasterEntry>();
  failingMaster.has = () => {
    throw new Error("synthetic-secret-value");
  };
  for (const stockMaster of [
    failingMaster,
    new Proxy(new Map(), {}),
    Object.create(Map.prototype),
  ]) {
    expect(inspectHoldingsCsv(csv(cells()), stockMaster)).toEqual({
      kind: "rejected",
      reason: "invalid_stock_master",
    });
  }
});

test("successful results retain no known codes, custody, names or decimal cells", () => {
  const row = cells({ 4: "synthetic-secret-value", 5: "7".repeat(9), 6: "8".repeat(8) });
  const result = inspected(csv(row));
  expect(result.valid).toBe(true);
  const serialized = JSON.stringify(result);
  for (const column of [1, 2, 4, 5, 6]) expect(serialized).not.toContain(row[column - 1]);
});

function utf8(text: string): Uint8Array {
  return Uint8Array.from(encodeURIComponent(text).match(/%[0-9A-F]{2}|./g) ?? [], (part) =>
    part.startsWith("%") ? Number.parseInt(part.slice(1), 16) : part.charCodeAt(0),
  );
}

test.each([false, true])("UTF-8 byte input with BOM=%s receives full value inspection", (bom) => {
  const bytes = utf8(`${bom ? "\uFEFF" : ""}${csv(cells())}`);
  const before = bytes.slice();
  expect(inspected(bytes)).toMatchObject({ valid: true, encoding: "utf-8", rowsScanned: 1 });
  expect(bytes).toEqual(before);
});

test("CP932 header and synthetic cells support full value inspection", () => {
  const hex = [
    "96 c1 95 bf 2c 96 c1 95 bf 2c 96 c1 95 bf 2c 97 61 82 e8 8b e6 95 aa",
    "2c 95 db 97 4c 8a 94 90 94 2c 8e e6 93 be 92 50 89 bf 2c 8c bb 8d dd 92 6c",
    "2c 8c bb 8d dd 92 6c 2c 95 5d 89 bf 91 b9 89 76 2c 95 5d 89 bf 91 b9 89 76 28 25 29",
    "2c 94 83 95 74 8b e0 8a 7a 2c 95 5d 89 bf 8a 7a 2c 91 4f 93 fa 8f 49 92 6c",
    "2c 91 4f 93 fa 94 e4 2c 91 4f 93 fa 94 e4 28 25 29 2c 95 5d 89 bf 8a 7a 91 4f 93 fa 94 e4",
    "2c 97 5c 91 7a 50 45 52 28 94 7b 29 2c 8e c0 90 d1 50 42 52 28 94 7b 29",
    "2c 97 5c 91 7a 94 7a 93 96 97 98 89 f1 82 e8 28 25 29 2c 97 5c 91 7a 45 50 53",
    "2c 8e c0 90 d1 42 50 53 2c 97 5c 91 7a 31 8a 94 94 7a 93 96",
  ].join(" ");
  const row = cells({ 2: "synthetic", 4: "NISA" });
  const bytes = Uint8Array.from([
    ...hex.split(" ").map((part) => Number.parseInt(part, 16)),
    ...utf8(`\r\n${record(row)}`),
  ]);
  expect(inspected(bytes)).toMatchObject({ valid: true, encoding: "cp932", findings: [] });
});

test.each([
  [csv(cells(), cells()), { maxDataRows: 1 }],
  [csv(cells()), { maxColumns: 21 }],
  [utf8(csv(cells())), { maxBytes: 1 }],
  [csv(cells()), { maxBytes: 1 }],
  [null, {}],
] as const)("structure rejections pass through unchanged", (input, limits) => {
  const expected = checkCsvStructure(input as never, limits);
  expect(expected.kind).toBe("rejected");
  expect(inspectHoldingsCsv(input as never, master, limits)).toEqual(expected);
});

test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  "invalid limit %s is not masked by the internal full findings limit",
  (value) => {
    for (const key of Object.keys(DEFAULT_INSPECTION_LIMITS)) {
      expect(inspectHoldingsCsv(csv(cells()), master, { [key]: value })).toEqual({
        kind: "rejected",
        reason: "invalid_limits",
      });
    }
  },
);

test.each([null, 1, "invalid"])("invalid overrides %j return a fixed rejection", (limits) => {
  expect(inspectHoldingsCsv(csv(cells()), master, limits as never)).toEqual({
    kind: "rejected",
    reason: "invalid_limits",
  });
});

test.each([{}, null, undefined, [], new Set()])(
  "non-Map master returns a fixed rejection",
  (value) => {
    expect(inspectHoldingsCsv(csv(cells()), value as never)).toEqual({
      kind: "rejected",
      reason: "invalid_stock_master",
    });
  },
);

test("10,000 records are fully counted with a zero findings return limit", () => {
  const input = [header, ...Array<string>(10000).fill(record(cells({ 5: "--" })))].join("\n");
  expect(inspected(input, master, { maxReturnedFindings: 0 })).toMatchObject({
    rowsScanned: 10000,
    valid: false,
    errorCount: 10000,
    totalCount: 10000,
    returnedCount: 0,
    truncated: true,
  });
});
