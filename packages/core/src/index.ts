export { aggregateHoldings } from "./aggregation/aggregate";
export type {
  AggregationRejection,
  HoldingRow,
  HoldingsAggregation,
  SectorComposition,
  SectorShare,
} from "./aggregation/types";
export { inspectAndAggregateHoldingsCsv } from "./holdings/inspect-and-aggregate";
export type { HoldingsCsvResult } from "./holdings/types";
export { createFinding, summarizeFindings } from "./inspection/findings";
export { inspectHoldingsCsv } from "./inspection/inspect";
export type {
  CsvEncoding,
  Finding,
  FindingCode,
  FindingCounts,
  FindingField,
  FindingPosition,
  FindingSeverity,
  FindingSummary,
  HoldingsInspection,
  InspectionLimits,
  LimitRejection,
  StockCodeMatch,
  StockMaster,
  StockMasterEntry,
  StockMasterSector,
} from "./inspection/types";
export {
  DEFAULT_INSPECTION_LIMITS,
  FINDING_CODES,
  FINDING_FIELDS,
  FINDING_MESSAGES,
  HOLDINGS_COLUMNS,
  HOLDINGS_PROFILE,
} from "./inspection/types";
export { checkStockCode } from "./inspection/values";
