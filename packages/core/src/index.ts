export { aggregateHoldings } from "./aggregation/aggregate";
export type {
  AggregationRejection,
  HoldingRow,
  HoldingsAggregation,
  SectorComposition,
  SectorShare,
} from "./aggregation/types";
export { createFinding, summarizeFindings } from "./inspection/findings";
export { inspectHoldingsCsv } from "./inspection/inspect";
export { checkCsvStructure } from "./inspection/structure";
export type {
  CsvEncoding,
  CsvRecord,
  Finding,
  FindingCode,
  FindingCounts,
  FindingField,
  FindingPosition,
  FindingSeverity,
  FindingSummary,
  HoldingsColumnIndexes,
  HoldingsInspection,
  InspectionLimits,
  LimitRejection,
  StockCodeMatch,
  StockMaster,
  StockMasterEntry,
  StockMasterSector,
  StructureInspection,
  StructureResult,
} from "./inspection/types";
export {
  DEFAULT_INSPECTION_LIMITS,
  FINDING_CODES,
  FINDING_FIELDS,
  FINDING_MESSAGES,
  HOLDINGS_COLUMNS,
  HOLDINGS_PROFILE,
} from "./inspection/types";
