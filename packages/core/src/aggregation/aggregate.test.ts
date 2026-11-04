import { expect, test } from "vitest";
import {
  aggregateHoldings,
  type HoldingRow,
  type StockMaster,
  type StockMasterEntry,
} from "../index";

function row(
  stockCode = "1001",
  currentPrice = "1",
  holdingCount = "1",
  dividendPerShare = "0",
): HoldingRow {
  return { stockCode, holdingCount, currentPrice, dividendPerShare };
}

function entry(code: string | null, name = "合成業種"): StockMasterEntry {
  const sector = code === null ? null : { code, name };
  return { sector17: sector, sector33: sector };
}

const axes = ["sector17", "sector33"] as const;

test("CSV cell spellings are parsed without mutating frozen rows or master entries", () => {
  const rows = Object.freeze([
    Object.freeze(row("1001", " 1.20000 ", " 1,234.500000 ", " 2.00000  ~  3.000000 ")),
    Object.freeze(row("1001", "0.500000", "1.50", " 4.00000 ")),
  ]);
  const sector = Object.freeze({ code: "1", name: "合成業種" });
  const master = new Map([["1001", Object.freeze({ sector17: sector, sector33: sector })]]);
  expect(aggregateHoldings(rows, master)).toEqual({
    kind: "aggregation",
    totalAssetValue: "1482.15",
    annualDividend: { lower: "2475", upper: "3709.5" },
    sector17: {
      status: "computed",
      sectors: [{ code: "1", name: "合成業種", ratio: "100.00" }],
    },
    sector33: {
      status: "computed",
      sectors: [{ code: "1", name: "合成業種", ratio: "100.00" }],
    },
  });
});

test("duplicate stock codes add every row and mixed dividends keep both annual bounds", () => {
  expect(
    aggregateHoldings(
      [
        row("1001", "100", "2", "10~20"),
        row("1001", "200", "3", "4"),
        row("1001", "0", "1", "0.5~0.5"),
      ],
      new Map([["1001", entry("1")]]),
    ),
  ).toEqual({
    kind: "aggregation",
    totalAssetValue: "800",
    annualDividend: { lower: "32.5", upper: "52.5" },
    sector17: { status: "computed", sectors: [{ code: "1", name: "合成業種", ratio: "100.00" }] },
    sector33: { status: "computed", sectors: [{ code: "1", name: "合成業種", ratio: "100.00" }] },
  });
});

test("unlike tfdata-api, unknown stocks contribute to assets, both dividend bounds and unclassified sectors", () => {
  expect(
    aggregateHoldings(
      [row("1001", "10", "2", "1"), row("1002", "20", "1", "3~5")],
      new Map([["1001", entry("1")]]),
    ),
  ).toEqual({
    kind: "aggregation",
    totalAssetValue: "40",
    annualDividend: { lower: "5", upper: "7" },
    sector17: {
      status: "computed",
      sectors: [
        { code: "1", name: "合成業種", ratio: "50.00" },
        { code: null, name: null, ratio: "50.00" },
      ],
    },
    sector33: {
      status: "computed",
      sectors: [
        { code: "1", name: "合成業種", ratio: "50.00" },
        { code: null, name: null, ratio: "50.00" },
      ],
    },
  });
});

test("unlike tfdata-api, sector33 is aggregated independently using the same rules as sector17", () => {
  const master = new Map<string, StockMasterEntry>([
    ["1001", { sector17: { code: "1", name: "最初の17業種" }, sector33: null }],
    [
      "1002",
      { sector17: { code: "1", name: "後の名称" }, sector33: { code: "1050", name: "合成33業種" } },
    ],
    ["1003", { sector17: null, sector33: { code: "1050", name: "別の名称" } }],
    ["1004", entry(null)],
  ]);
  expect(
    aggregateHoldings(
      [row("1001", "4"), row("1002", "3"), row("1003", "2"), row("1004"), row("1005")],
      master,
    ),
  ).toEqual({
    kind: "aggregation",
    totalAssetValue: "11",
    annualDividend: { lower: "0", upper: "0" },
    sector17: {
      status: "computed",
      sectors: [
        { code: "1", name: "最初の17業種", ratio: "63.64" },
        { code: null, name: null, ratio: "36.36" },
      ],
    },
    sector33: {
      status: "computed",
      sectors: [
        { code: null, name: null, ratio: "54.55" },
        { code: "1050", name: "合成33業種", ratio: "45.45" },
      ],
    },
  });
});

test("unlike tfdata-api, annual dividends return lower and upper rather than choosing a range endpoint", () => {
  const result = aggregateHoldings([row("1001", "1", "2", "1.0001~2.0002")], new Map());
  expect(result).toMatchObject({
    kind: "aggregation",
    annualDividend: { lower: "2.0002", upper: "4.0004" },
  });
});

test.each(axes)("%s leaves three rounded thirds at 99.99 without correction", (axis) => {
  const result = aggregateHoldings(
    [row("1001"), row("1002"), row("1003")],
    new Map([
      ["1001", entry("3")],
      ["1002", entry("2")],
      ["1003", entry("1")],
    ]),
  );
  expect(result.kind).toBe("aggregation");
  if (result.kind !== "aggregation") return;
  expect(result[axis]).toEqual({
    status: "computed",
    sectors: [
      { code: "1", name: "合成業種", ratio: "33.33" },
      { code: "2", name: "合成業種", ratio: "33.33" },
      { code: "3", name: "合成業種", ratio: "33.33" },
    ],
  });
});

test.each(axes)("%s leaves 87.66 plus 12.35 at 100.01 without correction", (axis) => {
  const result = aggregateHoldings(
    [row("1001", "87.655"), row("1002", "12.345")],
    new Map([
      ["1001", entry("1")],
      ["1002", entry("2")],
    ]),
  );
  expect(result.kind).toBe("aggregation");
  if (result.kind !== "aggregation") return;
  expect(result[axis]).toEqual({
    status: "computed",
    sectors: [
      { code: "1", name: "合成業種", ratio: "87.66" },
      { code: "2", name: "合成業種", ratio: "12.35" },
    ],
  });
});

test.each([
  ["1.2349", "98.7651", "1.23"],
  ["1.235", "98.765", "1.24"],
  ["1.2351", "98.7649", "1.24"],
  ["1", "31", "3.13"],
])("half up rounds %s of %s at the exact decimal boundary", (part, rest, ratio) => {
  const result = aggregateHoldings(
    [row("1001", part), row("1002", rest)],
    new Map([
      ["1001", entry("1")],
      ["1002", entry("2")],
    ]),
  );
  expect(result.kind).toBe("aggregation");
  if (result.kind !== "aggregation") return;
  for (const axis of axes) {
    expect(result[axis].sectors).toContainEqual({ code: "1", name: "合成業種", ratio });
  }
});

test.each(axes)("%s sorts rounded ties by numeric code, with unclassified last", (axis) => {
  const result = aggregateHoldings(
    [row("1003", "10.0001"), row("1001", "10"), row("1002", "9.9999")],
    new Map([
      ["1001", entry("10")],
      ["1002", entry("2")],
    ]),
  );
  expect(result.kind).toBe("aggregation");
  if (result.kind !== "aggregation") return;
  expect(result[axis]).toEqual({
    status: "computed",
    sectors: [
      { code: "2", name: "合成業種", ratio: "33.33" },
      { code: "10", name: "合成業種", ratio: "33.33" },
      { code: null, name: null, ratio: "33.33" },
    ],
  });
});

test.each(axes)(
  "%s keeps zero-valued and rounded-to-zero sectors and omits unheld sectors",
  (axis) => {
    const result = aggregateHoldings(
      [
        row("1001", "10000"),
        row("1002", "0"),
        row("1003", "0.0001", "0.0001"),
        row("1004", "10", "0"),
        row("1005", "0"),
      ],
      new Map([
        ["1001", entry("1")],
        ["1002", entry("2")],
        ["1003", entry("3")],
        ["1004", entry("4")],
        ["1006", entry("9")],
      ]),
    );
    expect(result.kind).toBe("aggregation");
    if (result.kind !== "aggregation") return;
    expect(result.totalAssetValue).toBe("10000.00000001");
    expect(result[axis]).toEqual({
      status: "computed",
      sectors: [
        { code: "1", name: "合成業種", ratio: "100.00" },
        { code: "2", name: "合成業種", ratio: "0.00" },
        { code: "3", name: "合成業種", ratio: "0.00" },
        { code: "4", name: "合成業種", ratio: "0.00" },
        { code: null, name: null, ratio: "0.00" },
      ],
    });
  },
);

test.each([
  { rows: [], lower: "0", upper: "0" },
  { rows: [row("1001", "10", "0", "1~2")], lower: "0", upper: "0" },
  { rows: [row("1001", "0", "2", "3~4")], lower: "6", upper: "8" },
])("zero total cannot compute composition, including empty rows: %j", ({ rows, lower, upper }) => {
  expect(aggregateHoldings(rows, new Map([["1001", entry("1")]]))).toEqual({
    kind: "aggregation",
    totalAssetValue: "0",
    annualDividend: { lower, upper },
    sector17: { status: "not_computable", sectors: [] },
    sector33: { status: "not_computable", sectors: [] },
  });
});

test("maximum input values retain all product digits without exponent notation or dividend cap", () => {
  const result = aggregateHoldings(
    [row("1001", "9999999999.9999", "9999999999.9999", "999999.9999")],
    new Map(),
  );
  expect(result).toMatchObject({
    kind: "aggregation",
    totalAssetValue: "99999999999998000000.00000001",
    annualDividend: { lower: "9999999998999900.00000001", upper: "9999999998999900.00000001" },
  });
});

test("smallest nonzero products retain eight decimal places", () => {
  expect(aggregateHoldings([row("1001", "0.0001", "0.0001", "0.0001")], new Map())).toEqual({
    kind: "aggregation",
    totalAssetValue: "0.00000001",
    annualDividend: { lower: "0.00000001", upper: "0.00000001" },
    sector17: { status: "computed", sectors: [{ code: null, name: null, ratio: "100.00" }] },
    sector33: { status: "computed", sectors: [{ code: null, name: null, ratio: "100.00" }] },
  });
});

test("10,000 maximum-sized rows keep every sum digit as literal decimal strings", () => {
  const rows = Array.from({ length: 10000 }, () =>
    row("1001", "9999999999.9999", "9999999999.9999", "999999.9999"),
  );
  expect(aggregateHoldings(rows, new Map([["1001", entry("1")]]))).toEqual({
    kind: "aggregation",
    totalAssetValue: "999999999999980000000000.0001",
    annualDividend: { lower: "99999999989999000000.0001", upper: "99999999989999000000.0001" },
    sector17: { status: "computed", sectors: [{ code: "1", name: "合成業種", ratio: "100.00" }] },
    sector33: { status: "computed", sectors: [{ code: "1", name: "合成業種", ratio: "100.00" }] },
  });
});

test.each([null, undefined, {}, "rows", [null], [undefined], ["row"], [{}], Array(1)])(
  "invalid row containers and shapes are rejected: %j",
  (rows) => {
    expect(aggregateHoldings(rows as unknown as readonly HoldingRow[], new Map())).toEqual({
      kind: "rejected",
      reason: "invalid_input",
    });
  },
);

test.each([
  { stockCode: " 1001" },
  { stockCode: "1001 " },
  { stockCode: "10000" },
  { stockCode: "1a0a" },
  { stockCode: 1001 },
  { holdingCount: "-1" },
  { holdingCount: "1e2" },
  { holdingCount: "1,23" },
  { holdingCount: "10000000000" },
  { holdingCount: "0.00001" },
  { holdingCount: 1 },
  { currentPrice: "NaN" },
  { currentPrice: "Infinity" },
  { currentPrice: "1\t" },
  { currentPrice: "\u30001" },
  { currentPrice: "1.00001" },
  { currentPrice: "10000000000" },
  { currentPrice: null },
  { dividendPerShare: "2~1" },
  { dividendPerShare: "1000000" },
  { dividendPerShare: "1~1000000" },
  { dividendPerShare: "1.00001" },
  { dividendPerShare: "1~~2" },
  { dividendPerShare: "1〜2" },
  { dividendPerShare: "1\t~2" },
  { dividendPerShare: undefined },
])("row fields are revalidated without exposing values: %j", (fields) => {
  expect(
    aggregateHoldings([{ ...row(), ...fields }] as unknown as readonly HoldingRow[], new Map()),
  ).toEqual({ kind: "rejected", reason: "invalid_input" });
});

test("throwing input getters become a fixed input rejection", () => {
  const input = {
    get stockCode(): string {
      throw new Error("synthetic-private-input");
    },
  };
  expect(aggregateHoldings([input] as unknown as readonly HoldingRow[], new Map())).toEqual({
    kind: "rejected",
    reason: "invalid_input",
  });
});

test.each([null, undefined, {}, { has: () => true, get: () => entry("1") }])(
  "master must be a Map: %j",
  (master) => {
    expect(aggregateHoldings([row()], master as unknown as StockMaster)).toEqual({
      kind: "rejected",
      reason: "invalid_stock_master",
    });
  },
);

test.each(["has", "get"] as const)(
  "throwing master %s becomes a fixed master rejection",
  (method) => {
    const master = new Map([["1001", entry("1")]]);
    Object.defineProperty(master, method, {
      value: () => {
        throw new Error("synthetic-private-master");
      },
    });
    expect(aggregateHoldings([row()], master)).toEqual({
      kind: "rejected",
      reason: "invalid_stock_master",
    });
  },
);

test("a Map proxy whose native methods throw is rejected", () => {
  expect(aggregateHoldings([row()], new Proxy(new Map(), {}))).toEqual({
    kind: "rejected",
    reason: "invalid_stock_master",
  });
});

test.each([undefined, null, "entry", {}, { sector17: null }])(
  "malformed master entries are rejected: %j",
  (value) => {
    const master = new Map([["1001", value]]) as unknown as StockMaster;
    expect(aggregateHoldings([row()], master)).toEqual({
      kind: "rejected",
      reason: "invalid_stock_master",
    });
  },
);

test.each(axes)("%s sector data is revalidated even for a zero-valued holding", (axis) => {
  for (const sector of [
    undefined,
    "sector",
    {},
    { code: "", name: "合成" },
    { code: "12345", name: "合成" },
    { code: "1\n", name: "合成" },
    { code: "１", name: "合成" },
    { code: " 1", name: "合成" },
    { code: 1, name: "合成" },
    { code: "1", name: null },
  ]) {
    const master = new Map([["1001", { ...entry("1"), [axis]: sector }]]) as unknown as StockMaster;
    expect(aggregateHoldings([row("1001", "0")], master)).toEqual({
      kind: "rejected",
      reason: "invalid_stock_master",
    });
  }
});

test.each(["0", "18", "01"])("sector17 rejects code %s", (code) => {
  const master = new Map([["1001", { sector17: { code, name: "合成17業種" }, sector33: null }]]);
  expect(aggregateHoldings([row()], master)).toEqual({
    kind: "rejected",
    reason: "invalid_stock_master",
  });
});

test("sector17 accepts code 17 and sector33 accepts code 18", () => {
  const master = new Map([
    [
      "1001",
      {
        sector17: { code: "17", name: "合成17業種" },
        sector33: { code: "18", name: "合成33業種" },
      },
    ],
  ]);
  expect(aggregateHoldings([row()], master)).toEqual({
    kind: "aggregation",
    totalAssetValue: "1",
    annualDividend: { lower: "0", upper: "0" },
    sector17: {
      status: "computed",
      sectors: [{ code: "17", name: "合成17業種", ratio: "100.00" }],
    },
    sector33: {
      status: "computed",
      sectors: [{ code: "18", name: "合成33業種", ratio: "100.00" }],
    },
  });
});

test("throwing sector getters become a fixed master rejection", () => {
  const sector = {
    get code(): string {
      throw new Error("synthetic-private-sector");
    },
    name: "合成",
  };
  expect(
    aggregateHoldings([row()], new Map([["1001", { sector17: sector, sector33: null }]])),
  ).toEqual({ kind: "rejected", reason: "invalid_stock_master" });
});
