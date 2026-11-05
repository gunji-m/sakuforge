import { aggregateHoldings } from "../aggregation/aggregate";
import { inspectHoldingsCsvWithRecords } from "../inspection/inspect";
import type { InspectionLimits, StockMaster } from "../inspection/types";
import type { HoldingsCsvResult } from "./types";

export function inspectAndAggregateHoldingsCsv(
  input: Uint8Array | string,
  stockMaster: StockMaster,
  overrides: Partial<InspectionLimits> = {},
): HoldingsCsvResult {
  const result = inspectHoldingsCsvWithRecords(input, stockMaster, overrides);
  if ("kind" in result) return result;
  const { inspection, records, columns } = result;
  if (!inspection.valid || columns === null) return { kind: "inspection_failed", inspection };

  const rows = records.map(({ cells }) => ({
    stockCode: cells[columns.stock_code] ?? "",
    holdingCount: cells[columns.holding_count] ?? "",
    currentPrice: cells[columns.current_price] ?? "",
    dividendPerShare: cells[columns.dividend_per_share] ?? "",
  }));
  const aggregation = aggregateHoldings(rows, stockMaster);
  if (aggregation.kind === "rejected") {
    return { kind: "aggregation_rejected", inspection, reason: aggregation.reason };
  }
  return { kind: "aggregated", inspection, aggregation };
}
