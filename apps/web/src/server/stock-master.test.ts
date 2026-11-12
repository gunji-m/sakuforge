import { expect, test } from "vitest";
import { loadCurrentStockMaster } from "./current-stock-master";
import {
  DEFAULT_STOCK_MASTER_LIMITS,
  parseStockMaster,
  type StockMasterRejectionReason,
} from "./stock-master";

const now = new Date("2026-11-12T00:00:00Z");
const relaxed = { minStocks: 1 };

type Json = Record<string, unknown>;

function sector(code: string, name = `合成業種${code}`): Json {
  return { code, name };
}

function stock(code: string, changes: Json = {}): Json {
  return { code, sector17: sector("1"), sector33: sector("50"), ...changes };
}

function master(changes: Json = {}): Json {
  return {
    schemaVersion: 1,
    asOf: "2026-10-31",
    fetchedAt: "2026-11-05T00:00:00Z",
    sourceSha256: "0".repeat(64),
    stocks: [stock("9A9A"), stock("9C9C", { sector17: null, sector33: null })],
    ...changes,
  };
}

/** Distinct synthetic codes in the valid format: 9000, 9001, ... */
function stocksOf(count: number): Json[] {
  return Array.from({ length: count }, (_, index) => stock(String(9000 + index)));
}

function reasonOf(value: unknown, overrides: object = relaxed): StockMasterRejectionReason | null {
  const result = parseStockMaster(value, now, overrides);
  return result.kind === "rejected" ? result.reason : null;
}

test("検証を通った JSON を、核の銘柄マスターと基準日に変換する", () => {
  const result = parseStockMaster(master(), now, relaxed);
  expect(result.kind).toBe("loaded");
  if (result.kind !== "loaded") return;
  expect(result.asOf).toBe("2026-10-31");
  expect([...result.stockMaster]).toEqual([
    [
      "9A9A",
      { sector17: { code: "1", name: "合成業種1" }, sector33: { code: "50", name: "合成業種50" } },
    ],
    ["9C9C", { sector17: null, sector33: null }],
  ]);
});

test("合成の銘柄マスターは、本物と同じ検証を通る", () => {
  const result = loadCurrentStockMaster(now);
  expect(result.kind).toBe("loaded");
  if (result.kind !== "loaded") return;
  expect([...result.stockMaster.keys()]).toEqual(["9A9A", "9C9C"]);
});

test.each([
  null,
  undefined,
  "合成文字列",
  1,
  [],
  [master()],
  master({ schemaVersion: "1" }),
  master({ schemaVersion: 1.5 }),
  master({ stocks: {} }),
  master({ stocks: [null] }),
  master({ stocks: ["9A9A"] }),
  master({ fetchedAt: "2026-11-05" }),
  master({ fetchedAt: "2026-13-05T00:00:00Z" }),
  master({ fetchedAt: 0 }),
  master({ sourceSha256: "0".repeat(63) }),
  master({ sourceSha256: "G".repeat(64) }),
  master({ sourceSha256: null }),
])("形の合わない JSON を invalid_shape で拒否する（%#）", (value) => {
  expect(reasonOf(value)).toBe("invalid_shape");
});

test.each([0, 2, -1])("知らない版 %s を unsupported_version で拒否する", (schemaVersion) => {
  expect(reasonOf(master({ schemaVersion }))).toBe("unsupported_version");
});

test.each([
  "2026-02-30",
  "2026-13-01",
  "2026-1-31",
  "20261031",
  "2026-10-31T00:00:00Z",
  "2026-11-13",
  "",
  null,
  20261031,
])("実在しない日付と未来の日付 %s を invalid_as_of で拒否する", (asOf) => {
  expect(reasonOf(master({ asOf }))).toBe("invalid_as_of");
});

test("基準日は当日まで受け付ける", () => {
  expect(reasonOf(master({ asOf: "2026-11-12" }))).toBeNull();
});

test("件数は下限ちょうど・上限ちょうどを受け付け、外側を拒否する", () => {
  const limits = { minStocks: 2, maxStocks: 3 };
  expect(reasonOf(master({ stocks: stocksOf(1) }), limits)).toBe("stock_count_out_of_range");
  expect(reasonOf(master({ stocks: stocksOf(2) }), limits)).toBeNull();
  expect(reasonOf(master({ stocks: stocksOf(3) }), limits)).toBeNull();
  expect(reasonOf(master({ stocks: stocksOf(4) }), limits)).toBe("stock_count_out_of_range");
});

test("既定の下限は、合成の 2 銘柄を受け付けない", () => {
  expect(DEFAULT_STOCK_MASTER_LIMITS.minStocks).toBeGreaterThan(2);
  expect(reasonOf(master(), {})).toBe("stock_count_out_of_range");
});

test.each(["9a9a", "0A9A", "90000", "9A9", " 9A9A", "9A9B", "", 9000, null])(
  "形式の合わない証券コード %s を invalid_stock_code で拒否する",
  (code) => {
    expect(reasonOf(master({ stocks: [stock("9A9A"), { ...stock("9C9C"), code }] }))).toBe(
      "invalid_stock_code",
    );
  },
);

test("同じ証券コードの重複を duplicate_stock_code で拒否する", () => {
  expect(reasonOf(master({ stocks: [stock("9A9A"), stock("9A9A")] }))).toBe("duplicate_stock_code");
});

test.each([
  ["sector17", sector("0")],
  ["sector17", sector("18")],
  ["sector17", sector("01")],
  ["sector17", { code: 1, name: "合成業種1" }],
  ["sector33", sector("0")],
  ["sector33", sector("0050")],
  ["sector33", sector("10500")],
  ["sector33", sector("5A")],
  ["sector33", sector("50", "")],
  ["sector33", sector("50", "合成\u0000業種")],
  ["sector33", sector("50", "合成\n業種")],
  ["sector33", { code: "50" }],
  ["sector33", "50"],
  ["sector33", undefined],
  ["sector33", []],
] as const)("%s の不正な業種を invalid_sector で拒否する（%#）", (axis, value) => {
  expect(reasonOf(master({ stocks: [stock("9A9A", { [axis]: value })] }))).toBe("invalid_sector");
});

test("17 業種は 1〜17、33 業種は 1〜4 桁の数字を受け付ける", () => {
  for (const code of ["1", "9", "10", "17"]) {
    expect(reasonOf(master({ stocks: [stock("9A9A", { sector17: sector(code) })] }))).toBeNull();
  }
  for (const code of ["5", "50", "1050", "9050"]) {
    expect(reasonOf(master({ stocks: [stock("9A9A", { sector33: sector(code) })] }))).toBeNull();
  }
});

test("name は上限ちょうどを受け付け、+1 文字を拒否する", () => {
  const limits = { minStocks: 1, maxNameLength: 4 };
  const withName = (name: string) =>
    master({ stocks: [stock("9A9A", { sector17: null, sector33: sector("50", name) })] });
  expect(reasonOf(withName("合成業種"), limits)).toBeNull();
  expect(reasonOf(withName("合成業種5"), limits)).toBe("invalid_sector");
});

test("同じ code に違う name が付いていたら拒否する", () => {
  const stocks = [
    stock("9A9A", { sector33: sector("50", "合成業種50") }),
    stock("9C9C", { sector33: sector("50", "合成業種五十") }),
  ];
  expect(reasonOf(master({ stocks }))).toBe("invalid_sector");
});

test("33 業種の code は 33 種類まで受け付け、34 種類目を拒否する", () => {
  const stocks = (count: number) =>
    stocksOf(count).map((entry, index) => ({ ...entry, sector33: sector(String(index + 1)) }));
  expect(reasonOf(master({ stocks: stocks(33) }))).toBeNull();
  expect(reasonOf(master({ stocks: stocks(34) }))).toBe("invalid_sector");
});

test.each([
  [{ minStocks: -1 }],
  [{ maxStocks: 0.5 }],
  [{ maxNameLength: Number.NaN }],
  [{ minStocks: 3, maxStocks: 2 }],
  [null],
])("不正な上限 %j を invalid_limits で拒否する", (overrides) => {
  expect(parseStockMaster(master(), now, overrides as never)).toEqual({
    kind: "rejected",
    reason: "invalid_limits",
  });
});

test("不正な現在時刻を invalid_limits で拒否する", () => {
  expect(reasonOf(master(), relaxed)).toBeNull();
  expect(parseStockMaster(master(), new Date(Number.NaN), relaxed)).toEqual({
    kind: "rejected",
    reason: "invalid_limits",
  });
});

test("拒否の結果に、JSON の値と例外の文言を含めない", () => {
  const secret = "合成例外の秘密文字列";
  const hostile = new Proxy(master(), {
    get() {
      throw new Error(secret);
    },
  });
  const results = [
    parseStockMaster(hostile, now, relaxed),
    parseStockMaster(master({ stocks: [stock(secret)] }), now, relaxed),
    parseStockMaster(
      master({ stocks: [stock("9A9A", { sector33: sector("50", `${secret}\u0000`) })] }),
      now,
      relaxed,
    ),
  ];
  expect(results.map((result) => result.kind)).toEqual(["rejected", "rejected", "rejected"]);
  expect(JSON.stringify(results)).not.toContain(secret);
  for (const result of results) expect(Object.keys(result).sort()).toEqual(["kind", "reason"]);
});
