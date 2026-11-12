import { parseStockMaster, type StockMasterResult } from "./stock-master";
import { syntheticStockMasterJson } from "./synthetic-stock-master";

/**
 * The stock master this deployment uses. Only the synthetic one exists so far; it is validated like
 * real input, with the count floor lowered because it holds two stocks.
 */
export function loadCurrentStockMaster(now: Date): StockMasterResult {
  return parseStockMaster(syntheticStockMasterJson, now, { minStocks: 1 });
}
