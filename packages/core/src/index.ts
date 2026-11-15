// The core's only way in from outside: inspect a holdings CSV and, if it passes,
// aggregate it (docs/design.md section 2). Inspection or aggregation alone, and the
// building blocks of findings, are not offered outside the package (#126).
export type {
  HoldingsAggregation,
  SectorComposition,
  SectorShare,
} from "./aggregation/types";
export { inspectAndAggregateHoldingsCsv } from "./holdings/inspect-and-aggregate";
export type { HoldingsCsvResult } from "./holdings/types";
export type {
  HoldingsInspection,
  InspectionLimits,
  StockMaster,
  StockMasterEntry,
  StockMasterSector,
} from "./inspection/types";
export { DEFAULT_INSPECTION_LIMITS, FINDING_MESSAGES } from "./inspection/types";
export { checkStockCode } from "./inspection/values";
