import { expect, test } from "vitest";
import { parseAggregation } from "./api-response";
import {
  clearResults,
  loadLatestResult,
  MAX_STORED_RESULTS,
  type ResultStorage,
  STORAGE_KEY,
  type StoredResult,
  saveResult,
} from "./storage";
import { aggregation, stockMaster } from "./test-data";

function memoryStorage(initial?: string): ResultStorage & { text: () => string | null } {
  let value: string | null = initial ?? null;
  return {
    getItem: (key) => (key === STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === STORAGE_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === STORAGE_KEY) value = null;
    },
    text: () => value,
  };
}

function stored(savedAt = "2026-11-12T09:00:00.000Z", total = "128100"): StoredResult {
  const parsed = parseAggregation(aggregation({ totalAssetValue: total }));
  if (parsed === null) throw new Error("合成テストデータが不正です");
  return {
    schemaVersion: 1,
    savedAt,
    aggregation: parsed,
    stockMaster,
    summary: { rowsScanned: 3, unknownCount: 1 },
  };
}

test("何も保存していなければ、最新の結果は無い", () => {
  expect(loadLatestResult(memoryStorage())).toBeNull();
});

test("保存した結果を、同じ値で読み戻す", () => {
  const storage = memoryStorage();
  expect(saveResult(storage, stored())).toBe(true);
  expect(loadLatestResult(storage)).toEqual(stored());
});

test("取り込むたびに 1 件足し、同じ日でも上書きしない。最新は先頭", () => {
  const storage = memoryStorage();
  saveResult(storage, stored("2026-11-12T09:00:00.000Z", "1"));
  saveResult(storage, stored("2026-11-12T09:05:00.000Z", "2"));
  const list = JSON.parse(storage.text() ?? "[]") as StoredResult[];
  expect(list.map(({ aggregation: { totalAssetValue } }) => totalAssetValue)).toEqual(["2", "1"]);
  expect(loadLatestResult(storage)?.aggregation.totalAssetValue).toBe("2");
});

test("最大件数を超えたら、古いものから消す", () => {
  const storage = memoryStorage();
  for (let index = 0; index <= MAX_STORED_RESULTS; index++) {
    saveResult(storage, stored("2026-11-12T09:00:00.000Z", String(index)));
  }
  const list = JSON.parse(storage.text() ?? "[]") as StoredResult[];
  expect(list).toHaveLength(MAX_STORED_RESULTS);
  expect(list[0]?.aggregation.totalAssetValue).toBe(String(MAX_STORED_RESULTS));
  expect(list.at(-1)?.aggregation.totalAssetValue).toBe("1");
});

test("保存する JSON は、設計 8.5 の項目だけを持つ", () => {
  const storage = memoryStorage();
  saveResult(storage, stored());
  const [entry] = JSON.parse(storage.text() ?? "[]") as Record<string, unknown>[];
  expect(Object.keys(entry ?? {}).sort()).toEqual([
    "aggregation",
    "savedAt",
    "schemaVersion",
    "stockMaster",
    "summary",
  ]);
});

test("知らない版と形の合わないものは表示に使わず、消さない", () => {
  const future = { schemaVersion: 2, savedAt: "2026-12-01T00:00:00.000Z", next: "合成の将来の形" };
  const broken = { schemaVersion: 1, savedAt: "2026-11-30" };
  const storage = memoryStorage(JSON.stringify([future, broken, stored()]));
  expect(loadLatestResult(storage)).toEqual(stored());
  saveResult(storage, stored("2026-12-02T00:00:00.000Z", "5"));
  expect(JSON.parse(storage.text() ?? "[]")).toEqual([
    stored("2026-12-02T00:00:00.000Z", "5"),
    future,
    broken,
    stored(),
  ]);
});

test.each([
  ["版が違う", { ...stored(), schemaVersion: 2 }],
  ["取り込み日時が無い", { ...stored(), savedAt: undefined }],
  ["取り込み日時の形が違う", { ...stored(), savedAt: "2026-11-12 09:00" }],
  ["取り込み日時が実在しない", { ...stored(), savedAt: "2026-13-40T09:00:00.000Z" }],
  ["集計の形が違う", { ...stored(), aggregation: { totalAssetValue: 1 } }],
  ["出典が無い", { ...stored(), stockMaster: null }],
  ["件数が負", { ...stored(), summary: { rowsScanned: -1, unknownCount: 0 } }],
  ["件数が無い", { ...stored(), summary: null }],
  ["文字列", "合成文字列"],
  ["null", null],
])("形の合わない保存分（%s）は表示に使わない", (_name, entry) => {
  expect(loadLatestResult(memoryStorage(JSON.stringify([entry])))).toBeNull();
});

test.each(["{", '{"results":[]}', '"合成文字列"'])(
  "一覧として読めない保存 %j は表示に使わず、上書きもしない",
  (text) => {
    const storage = memoryStorage(text);
    expect(loadLatestResult(storage)).toBeNull();
    expect(saveResult(storage, stored())).toBe(false);
    expect(storage.text()).toBe(text);
  },
);

test("ブラウザが保存を拒んだら、例外を出さずに失敗を返す", () => {
  const refusing: ResultStorage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("合成例外", "QuotaExceededError");
    },
    removeItem: () => {
      throw new DOMException("合成例外", "SecurityError");
    },
  };
  expect(saveResult(refusing, stored())).toBe(false);
  expect(clearResults(refusing)).toBe(false);
  const unreadable: ResultStorage = {
    ...refusing,
    getItem: () => {
      throw new DOMException("合成例外", "SecurityError");
    },
  };
  expect(loadLatestResult(unreadable)).toBeNull();
  expect(saveResult(unreadable, stored())).toBe(false);
});

test("消すと、保存したものがすべて無くなる", () => {
  const storage = memoryStorage();
  saveResult(storage, stored());
  expect(clearResults(storage)).toBe(true);
  expect(storage.text()).toBeNull();
  expect(loadLatestResult(storage)).toBeNull();
});
