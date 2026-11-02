import { expect, test } from "vitest";
import {
  checkCsvStructure,
  createFinding,
  DEFAULT_INSPECTION_LIMITS,
  type FindingCode,
  HOLDINGS_HEADER,
  HOLDINGS_PROFILE,
  type InspectionLimits,
  type StructureInspection,
} from "../index";

const header =
  "銘柄,銘柄,銘柄,預り区分,保有株数,取得単価,現在値,現在値,評価損益,評価損益(%),買付金額,評価額,前日終値,前日比,前日比(%),評価額前日比,予想PER(倍),実績PBR(倍),予想配当利回り(%),予想EPS,実績BPS,予想1株配当";
const syntheticCells = [
  "9A9A",
  "架空銘柄",
  "架空分類",
  "架空口座",
  ...Array<string>(18).fill("0.0001"),
];
const data = syntheticCells.join(",");

function utf8(text: string): Uint8Array {
  return Uint8Array.from(encodeURIComponent(text).match(/%[0-9A-F]{2}|./g) ?? [], (part) =>
    part.startsWith("%") ? Number.parseInt(part.slice(1), 16) : part.charCodeAt(0),
  );
}

function checked(
  input: string | Uint8Array,
  limits?: Partial<InspectionLimits>,
): StructureInspection {
  const result = checkCsvStructure(input, limits);
  if (result.kind !== "structure") throw new Error("Expected structure result");
  return result;
}

test("profile and all 22 ordered header cells match section 2", () => {
  expect(HOLDINGS_PROFILE).toBe("domestic_cash_holdings_v1");
  expect(HOLDINGS_HEADER).toEqual(header.split(","));
  expect(HOLDINGS_HEADER).toHaveLength(22);
  expect(DEFAULT_INSPECTION_LIMITS).toEqual({
    maxBytes: 10 * 1024 * 1024,
    maxDataRows: 10000,
    maxColumns: 100,
    maxReturnedFindings: 200,
  });
});

test.each([
  [new Uint8Array(), "csv_empty", undefined],
  [`${header}\nsynthetic\u0000cell`, "csv_control_character", 2],
  [new Uint8Array([0x81]), "csv_encoding_unsupported", undefined],
  [`${header}\n"synthetic`, "csv_structure_invalid", 2],
  ["synthetic-secret-header", "csv_header_unsupported", undefined],
  [header, "csv_data_rows_empty", undefined],
  [`${header}\nsynthetic-secret-cell`, "csv_column_count_invalid", 2],
] as const)(
  "each of the seven structure findings has only its specified position",
  (input, code, row) => {
    const result = checked(input);
    expect(result.findings).toEqual([createFinding(code, row === undefined ? {} : { row })]);
    expect(result).toMatchObject({
      errorCount: 1,
      warningCount: 0,
      totalCount: 1,
      returnedCount: 1,
      truncated: false,
    });
    expect(result).not.toHaveProperty("valid");
    for (const finding of result.findings) {
      expect(finding).not.toHaveProperty("column");
      expect(finding).not.toHaveProperty("field");
      expect(finding.message).not.toContain("synthetic-secret-header");
      expect(finding.message).not.toContain("synthetic-secret-cell");
    }
  },
);

test.each([false, true])("UTF-8 byte input, BOM=%s", (bom) => {
  const bytes = utf8(`${bom ? "\uFEFF" : ""}${header}\n${data}`);
  expect(checked(bytes)).toMatchObject({
    encoding: "utf-8",
    profile: HOLDINGS_PROFILE,
    findings: [],
    rowsScanned: 1,
    records: [{ row: 2, cells: syntheticCells }],
  });
});

test("CP932 header bytes are assembled in the test, followed by synthetic ASCII data", () => {
  const headerHex = [
    "96 c1 95 bf 2c 96 c1 95 bf 2c 96 c1 95 bf 2c 97 61 82 e8 8b e6 95 aa",
    "2c 95 db 97 4c 8a 94 90 94 2c 8e e6 93 be 92 50 89 bf 2c 8c bb 8d dd 92 6c",
    "2c 8c bb 8d dd 92 6c 2c 95 5d 89 bf 91 b9 89 76 2c 95 5d 89 bf 91 b9 89 76 28 25 29",
    "2c 94 83 95 74 8b e0 8a 7a 2c 95 5d 89 bf 8a 7a 2c 91 4f 93 fa 8f 49 92 6c",
    "2c 91 4f 93 fa 94 e4 2c 91 4f 93 fa 94 e4 28 25 29 2c 95 5d 89 bf 8a 7a 91 4f 93 fa 94 e4",
    "2c 97 5c 91 7a 50 45 52 28 94 7b 29 2c 8e c0 90 d1 50 42 52 28 94 7b 29",
    "2c 97 5c 91 7a 94 7a 93 96 97 98 89 f1 82 e8 28 25 29 2c 97 5c 91 7a 45 50 53",
    "2c 8e c0 90 d1 42 50 53 2c 97 5c 91 7a 31 8a 94 94 7a 93 96",
  ].join(" ");
  const bytes = Uint8Array.from([
    ...headerHex.split(" ").map((hex) => Number.parseInt(hex, 16)),
    ...utf8(`\r\n${Array<string>(22).fill("synthetic").join(",")}`),
  ]);
  expect(checked(bytes)).toMatchObject({
    encoding: "cp932",
    profile: HOLDINGS_PROFILE,
    findings: [],
    rowsScanned: 1,
  });
});

test("strings stay strings, with no byte-size assumption or value rules", () => {
  const invalidValues = Array<string>(22).fill("not-validated");
  expect(checked(`\uFEFF${header}\n${invalidValues.join(",")}`, { maxBytes: 0 })).toMatchObject({
    encoding: null,
    findings: [],
    records: [{ row: 2, cells: invalidValues }],
  });
  expect(checked(`${header}\n${data}\n${data}`)).toMatchObject({ findings: [], rowsScanned: 2 });
});

test.each(["\n", "\r", "\r\n"])(
  "physical rows count quoted newlines and blank lines for %j",
  (newline) => {
    const multilineCells = [...syntheticCells];
    multilineCells[1] = `"synthetic, quoted ""name""${newline}continued"`;
    const result = checked(
      `${header}${newline}${multilineCells.join(",")}${newline}bad${newline}${newline}also-bad${newline}`,
    );
    expect(result.records.map((record) => record.row)).toEqual([2, 4, 6]);
    expect(result.records[0]?.cells[1]).toBe(`synthetic, quoted "name"${newline}continued`);
    expect(result.findings).toEqual([
      createFinding("csv_column_count_invalid", { row: 4 }),
      createFinding("csv_column_count_invalid", { row: 6 }),
    ]);
    expect(result.rowsScanned).toBe(3);
  },
);

test("leading blanks are skipped; whitespace-only, empty quoted cells and commas are records", () => {
  const result = checked(`\r\n\n${header}\r \n,,,\n""\n`);
  expect(result.rowsScanned).toBe(3);
  expect(result.records).toEqual([
    { row: 4, cells: [" "] },
    { row: 5, cells: ["", "", "", ""] },
    { row: 6, cells: [""] },
  ]);
  expect(result.findings.map((finding) => finding.row)).toEqual([4, 5, 6]);
});

test.each(["", "\r\n\r\n\n\r"])("empty content and truly empty lines have no location", (input) => {
  expect(checked(input)).toMatchObject({
    findings: [createFinding("csv_empty")],
    rowsScanned: 0,
    records: [],
    profile: null,
  });
});

test("header trimming removes only ASCII spaces at cell edges, preserving raw data cells", () => {
  const padded = HOLDINGS_HEADER.map((cell) => `  ${cell}  `).join(",");
  expect(checked(`${padded}\n${data}`)).toMatchObject({
    findings: [],
    records: [{ row: 2, cells: syntheticCells }],
  });
});

test.each(["\t", "\u3000", "\u00A0"])("header padding with %j is not removed", (padding) => {
  const padded = HOLDINGS_HEADER.map((cell) => `${padding}${cell}${padding}`).join(",");
  expect(checked(`${padded}\n${data}`).findings).toEqual([createFinding("csv_header_unsupported")]);
});

test("header with a long internal ASCII space run is unsupported", () => {
  const cells = [...HOLDINGS_HEADER];
  const unsupportedHeader = [`銘柄${" ".repeat(100000)}x`, ...cells.slice(1)].join(",");
  expect(checked(`${unsupportedHeader}\n${data}`).findings).toEqual([
    createFinding("csv_header_unsupported"),
  ]);
});

test.each([
  header.replace("銘柄", "別名"),
  header.replace("予想PER", "予想per"),
  header.replace("予想1株配当", "予想１株配当"),
  header.replace("銘柄", "銘 柄"),
  header.replace("預り区分,保有株数", "保有株数,預り区分"),
  `${header},extra`,
  header.split(",").slice(1).join(","),
  `explanation\n${header}`,
  ` \n${header}`,
  `,,,\n${header}`,
])("header changes and preceding nonempty explanations are not corrected", (input) => {
  expect(checked(`${input}\n${data}`).findings).toEqual([createFinding("csv_header_unsupported")]);
});

test.each(['"unclosed', 'before"after', '"closed"after', '"closed" ', '"closed"\t'])(
  "invalid syntax stops at its record start",
  (bad) => {
    const result = checked(`${header}\n${data}\n\n${bad}\nnext`);
    expect(result).toMatchObject({
      profile: null,
      records: [],
      rowsScanned: 1,
      findings: [createFinding("csv_structure_invalid", { row: 4 })],
    });
  },
);

test.each(["\u0000", "\u000B", "\u001F", "\u007F", "\u0085", "\u009F"])(
  "forbidden Cc character %j stops before syntax checks",
  (control) => {
    const result = checked(`${header}\n"synthetic\n${control}continued`);
    expect(result.findings).toEqual([createFinding("csv_control_character", { row: 2 })]);
    expect(result.records).toEqual([]);
    expect(result.rowsScanned).toBe(0);
  },
);

test("control position counts blank lines; earlier ambiguous syntax omits its row", () => {
  expect(checked(`\n${header}\r\n\r\n"x\r\ny\u0000"`).findings).toEqual([
    createFinding("csv_control_character", { row: 4 }),
  ]);
  expect(checked(`${header}\nbad"quote\n\u0000`).findings).toEqual([
    createFinding("csv_control_character"),
  ]);
});

test("TAB, LF and CR are allowed, and quoted empty cells and escaped quotes parse exactly", () => {
  const cells = Array<string>(22).fill("");
  cells[0] = "\t";
  cells[1] = '""';
  cells[2] = '""""';
  const result = checked(`${header}\n${cells.join(",")}`);
  expect(result.findings).toEqual([]);
  expect(result.records[0]?.cells.slice(0, 3)).toEqual(["\t", "", '"']);
});

test("byte limit accepts exactly the limit and rejects +1 before decoding or scanning", () => {
  const bytes = utf8(`${header}\n${data}`);
  expect(checked(bytes, { maxBytes: bytes.length }).findings).toEqual([]);
  expect(checkCsvStructure(new Uint8Array([...bytes, 10]), { maxBytes: bytes.length })).toEqual({
    kind: "rejected",
    reason: "maxBytes",
  });
  expect(checkCsvStructure(new Uint8Array(10 * 1024 * 1024 + 1))).toEqual({
    kind: "rejected",
    reason: "maxBytes",
  });
});

test.each([false, true])("10 MiB input with a single large cell, quoted=%s", (quoted) => {
  const prefix = utf8(`${header}\n`);
  const bytes = new Uint8Array(DEFAULT_INSPECTION_LIMITS.maxBytes);
  bytes.set(prefix);
  bytes.fill(quoted ? 0x22 : 0x78, prefix.length);
  const cellBytes = bytes.length - prefix.length;
  // Keep opening/closing quotes and escaped pairs balanced for either byte-length parity.
  if (quoted && cellBytes % 2 !== 0) bytes[prefix.length + 1] = 0x78;

  const result = checked(bytes);
  expect(result.encoding).toBe("utf-8");
  expect(result.rowsScanned).toBe(1);
  expect(result.records).toHaveLength(1);
  expect(result.records[0]?.row).toBe(2);
  expect(result.records[0]?.cells).toHaveLength(1);
  expect(result.records[0]?.cells[0]?.length).toBe(
    quoted ? Math.floor((cellBytes - 1) / 2) : cellBytes,
  );
  expect(result.findings).toEqual([createFinding("csv_column_count_invalid", { row: 2 })]);
});

test("data record limit ignores header, blanks and quoted newlines; accepts boundary and rejects +1", () => {
  const two = `${header}\n\n${data}\n${data}\n\n`;
  expect(checked(two, { maxDataRows: 2 }).rowsScanned).toBe(2);
  expect(checkCsvStructure(`${two}${data}`, { maxDataRows: 2 })).toEqual({
    kind: "rejected",
    reason: "maxDataRows",
  });
  expect(checkCsvStructure(`${header}\n${data}`, { maxDataRows: 0 })).toEqual({
    kind: "rejected",
    reason: "maxDataRows",
  });
  const defaults = `${header}\n${Array<string>(10000).fill(data).join("\n")}`;
  expect(checked(defaults).rowsScanned).toBe(10000);
  expect(checkCsvStructure(`${defaults}\n${data}`)).toEqual({
    kind: "rejected",
    reason: "maxDataRows",
  });
});

test("column limit applies during scanning to header and data, including trailing empty columns", () => {
  expect(checked(`${header}\n${data}`, { maxColumns: 22 }).findings).toEqual([]);
  for (const csv of [`${header},`, `${header}\n${data},`]) {
    expect(checkCsvStructure(csv, { maxColumns: 22 })).toEqual({
      kind: "rejected",
      reason: "maxColumns",
    });
  }
  expect(checked(`${header}\n${Array<string>(100).fill("").join(",")}`).findings).toEqual([
    createFinding("csv_column_count_invalid", { row: 2 }),
  ]);
  expect(checkCsvStructure(`${header}\n${Array<string>(101).fill("").join(",")}`)).toEqual({
    kind: "rejected",
    reason: "maxColumns",
  });
});

test("column errors continue scanning and counts remain complete when findings are truncated", () => {
  const result = checked(`${header}\n${Array<string>(5).fill("bad-cell-sentinel").join("\n")}`, {
    maxReturnedFindings: 2,
  });
  expect(result).toMatchObject({
    rowsScanned: 5,
    errorCount: 5,
    warningCount: 0,
    totalCount: 5,
    returnedCount: 2,
    truncated: true,
  });
  expect(result.findings).toEqual([
    createFinding("csv_column_count_invalid", { row: 2 }),
    createFinding("csv_column_count_invalid", { row: 3 }),
  ]);
  expect(result.findings.every((finding) => !finding.message.includes("bad-cell-sentinel"))).toBe(
    true,
  );
});

test.each([
  ['bad-header\n\u0000"', "csv_control_character"],
  ['bad-header\n"unclosed', "csv_structure_invalid"],
  ["bad-header", "csv_header_unsupported"],
] satisfies [string, FindingCode][])(
  "control, syntax, then header precedence is fixed",
  (csv, code) => {
    expect(checked(csv).findings.map((finding) => finding.code)).toEqual([code]);
  },
);

test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  "invalid limits %s are rejected without partial results",
  (limit) => {
    for (const key of Object.keys(DEFAULT_INSPECTION_LIMITS)) {
      expect(checkCsvStructure(header, { [key]: limit })).toEqual({
        kind: "rejected",
        reason: "invalid_limits",
      });
    }
  },
);

test("invalid runtime input and zero column limit return fixed rejections without exceptions", () => {
  for (const input of [null, undefined, 42, {}, []]) {
    expect(checkCsvStructure(input as never)).toEqual({
      kind: "rejected",
      reason: "invalid_input",
    });
  }
  expect(checkCsvStructure(header, { maxColumns: 0 })).toEqual({
    kind: "rejected",
    reason: "invalid_limits",
  });
  expect(checkCsvStructure(header, null as never)).toEqual({
    kind: "rejected",
    reason: "invalid_limits",
  });
});
