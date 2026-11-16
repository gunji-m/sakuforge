import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StockMaster } from "@sakuforge/core";
import { parseStockMaster, type StockMasterRejectionReason } from "./stock-master";
import { syntheticStockMasterJson } from "./synthetic-stock-master";

/** Shown wherever stock master data is displayed (docs/external-data-policy.md 3). */
export const TSE_STOCK_MASTER_SOURCE = "株式会社東京証券取引所「東証上場銘柄一覧」";
/** The synthetic master is not exchange data, so it must not carry the exchange's name. */
export const SYNTHETIC_STOCK_MASTER_SOURCE = "合成データ（東証のデータではありません）";

/**
 * Where the Production build writes the fetched stock master, relative to `apps/web`
 * (`scripts/fetch-stock-master.mjs`). `next.config.ts` traces it into the server function.
 */
export const REAL_STOCK_MASTER_FILE = "data/stock-master/stock-master.json";

export type CurrentStockMasterRejectionReason = StockMasterRejectionReason | "unreadable";

export type CurrentStockMaster =
  | {
      readonly kind: "loaded";
      readonly stockMaster: StockMaster;
      readonly asOf: string;
      readonly source: string;
    }
  | { readonly kind: "rejected"; readonly reason: CurrentStockMasterRejectionReason };

/** Only the Vercel Production deployment reads the real master (docs/design.md 4.5). */
export function usesRealStockMaster(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.VERCEL_ENV === "production";
}

/** Reads the fetched stock master JSON. Throws when it is missing or not JSON. */
export function readRealStockMasterJson(): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), REAL_STOCK_MASTER_FILE), "utf8"));
}

/**
 * Validates the real stock master like any untrusted input, with the default limits. Used by the
 * server function on every load and by `next.config.ts` as the gate of the Production build.
 */
export function loadRealStockMaster(now: Date, readJson: () => unknown): CurrentStockMaster {
  let json: unknown;
  try {
    json = readJson();
  } catch {
    // Never surface the exception text: it can carry the path or part of the file.
    return { kind: "rejected", reason: "unreadable" };
  }
  const result = parseStockMaster(json, now);
  return result.kind === "loaded" ? { ...result, source: TSE_STOCK_MASTER_SOURCE } : result;
}

/**
 * The stock master this deployment uses: the real one in Production, the synthetic one elsewhere
 * (Preview, local, CI). The synthetic one is validated like real input, with the count floor
 * lowered because it holds two stocks. Production never falls back to the synthetic one.
 */
export function loadCurrentStockMaster(
  now: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
  readJson: () => unknown = readRealStockMasterJson,
): CurrentStockMaster {
  if (usesRealStockMaster(env)) return loadRealStockMaster(now, readJson);
  const result = parseStockMaster(syntheticStockMasterJson, now, { minStocks: 1 });
  return result.kind === "loaded" ? { ...result, source: SYNTHETIC_STOCK_MASTER_SOURCE } : result;
}
