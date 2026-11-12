import {
  type Aggregation,
  parseAggregation,
  parseStockMaster,
  type StockMasterAttribution,
  SUPPORTED_SCHEMA_VERSION,
} from "./api-response";

/** One imported result as the browser keeps it (docs/design.md 8.5). Aggregates only. */
export interface StoredResult {
  readonly schemaVersion: typeof SUPPORTED_SCHEMA_VERSION;
  /** When the browser imported it, ISO 8601 in UTC. */
  readonly savedAt: string;
  readonly aggregation: Aggregation;
  readonly stockMaster: StockMasterAttribution;
  readonly summary: { readonly rowsScanned: number; readonly unknownCount: number };
}

export const STORAGE_KEY = "sakuforge.results";
export const MAX_STORED_RESULTS = 200;

/** The part of Web Storage this module uses, so tests can pass a fake. */
export type ResultStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Wraps a storage that may throw when it is obtained (for example `window.localStorage`
 * when the browser denies storage access), so that the failure happens inside the calls
 * below and is handled like any other storage failure.
 */
export function deferredStorage(get: () => ResultStorage): ResultStorage {
  return {
    getItem: (key) => get().getItem(key),
    setItem: (key, value) => get().setItem(key, value),
    removeItem: (key) => get().removeItem(key),
  };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseStored(value: unknown): StoredResult | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const { schemaVersion, savedAt, summary } = value as Record<string, unknown>;
    if (
      schemaVersion !== SUPPORTED_SCHEMA_VERSION ||
      typeof savedAt !== "string" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(savedAt) ||
      Number.isNaN(Date.parse(savedAt)) ||
      summary === null ||
      typeof summary !== "object"
    ) {
      return null;
    }
    const { rowsScanned, unknownCount } = summary as Record<string, unknown>;
    const aggregation = parseAggregation((value as Record<string, unknown>).aggregation);
    const stockMaster = parseStockMaster((value as Record<string, unknown>).stockMaster);
    if (
      !isCount(rowsScanned) ||
      !isCount(unknownCount) ||
      aggregation === null ||
      stockMaster === null
    ) {
      return null;
    }
    return {
      schemaVersion,
      savedAt,
      aggregation,
      stockMaster,
      summary: { rowsScanned, unknownCount },
    };
  } catch {
    return null;
  }
}

/** The stored list as written (newest first), or null when it cannot be read as a list. */
function readList(storage: ResultStorage): unknown[] | null {
  const text = storage.getItem(STORAGE_KEY);
  if (text === null) return [];
  const list: unknown = JSON.parse(text);
  return Array.isArray(list) ? list : null;
}

/**
 * The newest stored result that this version understands. Entries of an unknown version or shape
 * are skipped, never deleted (docs/design.md 8.6).
 */
export function loadLatestResult(storage: ResultStorage): StoredResult | null {
  try {
    for (const entry of readList(storage) ?? []) {
      const parsed = parseStored(entry);
      if (parsed !== null) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Adds one result in front and keeps the newest MAX_STORED_RESULTS entries. Returns false when
 * nothing was written; stored data that is not a list is left untouched rather than replaced.
 */
export function saveResult(storage: ResultStorage, result: StoredResult): boolean {
  try {
    const list = readList(storage);
    if (list === null) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify([result, ...list].slice(0, MAX_STORED_RESULTS)));
    return true;
  } catch {
    // Quota, private mode, storage disabled, unreadable stored text.
    return false;
  }
}

/**
 * Tells whether anything is kept under the storage key, including text this version
 * cannot show (unreadable text, unknown versions). Such data can still be cleared.
 */
export function hasStoredData(storage: ResultStorage): boolean {
  try {
    return storage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Removes every stored result. Returns false when the browser refuses. */
export function clearResults(storage: ResultStorage): boolean {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
