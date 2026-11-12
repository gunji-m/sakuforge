import type { StockMaster } from "@sakuforge/core";
import { parseStockMaster, type StockMasterRejectionReason } from "./stock-master";
import { syntheticStockMasterJson } from "./synthetic-stock-master";

/** Shown wherever stock master data is displayed (docs/external-data-policy.md 3). */
export const TSE_STOCK_MASTER_SOURCE = "株式会社東京証券取引所「東証上場銘柄一覧」";
/** The synthetic master is not exchange data, so it must not carry the exchange's name. */
export const SYNTHETIC_STOCK_MASTER_SOURCE = "合成データ（東証のデータではありません）";

export type CurrentStockMaster =
  | {
      readonly kind: "loaded";
      readonly stockMaster: StockMaster;
      readonly asOf: string;
      readonly source: string;
    }
  | { readonly kind: "rejected"; readonly reason: StockMasterRejectionReason };

/**
 * The stock master this deployment uses. Only the synthetic one exists so far; it is validated like
 * real input, with the count floor lowered because it holds two stocks.
 */
export function loadCurrentStockMaster(now: Date): CurrentStockMaster {
  const result = parseStockMaster(syntheticStockMasterJson, now, { minStocks: 1 });
  return result.kind === "loaded" ? { ...result, source: SYNTHETIC_STOCK_MASTER_SOURCE } : result;
}
