import {
  checkStockCode,
  type StockMaster,
  type StockMasterEntry,
  type StockMasterSector,
} from "@sakuforge/core";

/** The stock master JSON version this server function understands (docs/design.md 4.2). */
export const STOCK_MASTER_SCHEMA_VERSION = 1;

export interface StockMasterLimits {
  readonly minStocks: number;
  readonly maxStocks: number;
  /** UTF-16 code units. */
  readonly maxNameLength: number;
}

export const DEFAULT_STOCK_MASTER_LIMITS: StockMasterLimits = Object.freeze({
  minStocks: 1000,
  maxStocks: 20000,
  maxNameLength: 100,
});

export type StockMasterRejectionReason =
  | "invalid_limits"
  | "invalid_shape"
  | "unsupported_version"
  | "invalid_as_of"
  | "stock_count_out_of_range"
  | "invalid_stock_code"
  | "duplicate_stock_code"
  | "invalid_sector";

export type StockMasterResult =
  | {
      readonly kind: "loaded";
      readonly stockMaster: StockMaster;
      /** Reference date of the source list, YYYY-MM-DD. */
      readonly asOf: string;
    }
  | { readonly kind: "rejected"; readonly reason: StockMasterRejectionReason };

type Axis = "sector17" | "sector33";

const SECTOR_CODE: Readonly<Record<Axis, RegExp>> = {
  sector17: /^(?:[1-9]|1[0-7])$/,
  // The source value as digits, without added leading zeros.
  sector33: /^[1-9][0-9]{0,3}$/,
};
const MAX_SECTORS: Readonly<Record<Axis, number>> = { sector17: 17, sector33: 33 };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A real calendar date that is not after `now` (UTC). */
function isPastDate(text: string, now: Date): boolean {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    time <= now.getTime()
  );
}

function rejected(reason: StockMasterRejectionReason): StockMasterResult {
  return { kind: "rejected", reason };
}

/**
 * Validates untrusted stock master JSON and converts it for the core.
 * Results carry fixed reasons only: no JSON values and no exception text.
 */
export function parseStockMaster(
  value: unknown,
  now: Date,
  overrides: Partial<StockMasterLimits> = {},
): StockMasterResult {
  try {
    if (!isRecord(overrides) || !(now instanceof Date) || Number.isNaN(now.getTime())) {
      return rejected("invalid_limits");
    }
    const limits = { ...DEFAULT_STOCK_MASTER_LIMITS, ...overrides };
    if (
      !Object.values(limits).every((limit) => Number.isSafeInteger(limit) && limit >= 0) ||
      limits.minStocks > limits.maxStocks
    ) {
      return rejected("invalid_limits");
    }
    if (!isRecord(value)) return rejected("invalid_shape");
    if (!Number.isSafeInteger(value.schemaVersion)) return rejected("invalid_shape");
    if (value.schemaVersion !== STOCK_MASTER_SCHEMA_VERSION) {
      return rejected("unsupported_version");
    }
    const { asOf, fetchedAt, sourceSha256, stocks } = value;
    if (
      typeof fetchedAt !== "string" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(fetchedAt) ||
      Number.isNaN(Date.parse(fetchedAt)) ||
      typeof sourceSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(sourceSha256) ||
      !Array.isArray(stocks)
    ) {
      return rejected("invalid_shape");
    }
    if (typeof asOf !== "string" || !isPastDate(asOf, now)) return rejected("invalid_as_of");
    if (stocks.length < limits.minStocks || stocks.length > limits.maxStocks) {
      return rejected("stock_count_out_of_range");
    }

    const names: Readonly<Record<Axis, Map<string, string>>> = {
      sector17: new Map(),
      sector33: new Map(),
    };
    function readSector(sector: unknown, axis: Axis): StockMasterSector | null | undefined {
      if (sector === null) return null;
      if (!isRecord(sector)) return undefined;
      const { code, name } = sector;
      if (
        typeof code !== "string" ||
        !SECTOR_CODE[axis].test(code) ||
        typeof name !== "string" ||
        name.length === 0 ||
        name.length > limits.maxNameLength ||
        /\p{Cc}/u.test(name)
      ) {
        return undefined;
      }
      const known = names[axis].get(code);
      if (known === undefined) {
        if (names[axis].size >= MAX_SECTORS[axis]) return undefined;
        names[axis].set(code, name);
      } else if (known !== name) return undefined;
      return { code, name };
    }

    const stockMaster = new Map<string, StockMasterEntry>();
    for (const stock of stocks) {
      if (!isRecord(stock)) return rejected("invalid_shape");
      const { code } = stock;
      if (typeof code !== "string" || checkStockCode(code) !== null) {
        return rejected("invalid_stock_code");
      }
      if (stockMaster.has(code)) return rejected("duplicate_stock_code");
      const sector17 = readSector(stock.sector17, "sector17");
      const sector33 = readSector(stock.sector33, "sector33");
      if (sector17 === undefined || sector33 === undefined) return rejected("invalid_sector");
      stockMaster.set(code, { sector17, sector33 });
    }
    return { kind: "loaded", stockMaster, asOf };
  } catch {
    // Hostile objects (throwing getters, proxies) must not surface exception text.
    return rejected("invalid_shape");
  }
}
