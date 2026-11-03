export const FINDING_CODES = Object.freeze([
  "csv_empty",
  "csv_control_character",
  "csv_encoding_unsupported",
  "csv_structure_invalid",
  "csv_header_unsupported",
  "csv_data_rows_empty",
  "csv_column_count_invalid",
  "stock_code_invalid",
  "stock_code_unsupported",
  "custody_type_invalid",
  "holding_count_invalid",
  "purchase_price_invalid",
  "current_price_invalid",
  "dividend_per_share_invalid",
  "asset_key_duplicated",
  "stock_code_unknown",
] as const);

export type FindingCode = (typeof FINDING_CODES)[number];
export const FINDING_MESSAGES = Object.freeze({
  csv_empty: "CSVファイルが空です。保有資産のCSVを選んでください。",
  csv_control_character: "CSVに使用できない文字が含まれています。",
  csv_encoding_unsupported: "CSVの文字コードを読み取れません。UTF-8かShift_JISが必要です。",
  csv_structure_invalid: 'CSVの形式を読み取れません。引用符（"）の対応を確認してください。',
  csv_header_unsupported:
    "対応していない形式のCSVです。国内株式（現物）の保有資産CSVを選んでください。",
  csv_data_rows_empty: "保有銘柄の行がありません。",
  csv_column_count_invalid: "列の数が見出しと合わない行があります。",
  stock_code_invalid: "証券コードを読み取れません。4文字の証券コードが必要です。",
  stock_code_unsupported: "5桁の証券コードには、まだ対応していません。",
  custody_type_invalid: "預り区分を読み取れません。1〜32文字が必要です。",
  holding_count_invalid: "保有株数を読み取れません。0以上の数値が必要です。",
  purchase_price_invalid: "取得単価を読み取れません。0以上の数値が必要です。",
  current_price_invalid: "現在値を読み取れません。0以上の数値が必要です。",
  dividend_per_share_invalid: "予想1株配当を読み取れません。数値か範囲（例: 40 ~ 50）が必要です。",
  asset_key_duplicated: "同じ証券コードと預り区分の行が重複しています。",
  stock_code_unknown:
    "銘柄マスターに無い証券コードがあります。該当銘柄は「未分類」として集計しました。",
} satisfies Record<FindingCode, string>);

export const FINDING_FIELDS = Object.freeze([
  "stock_code",
  "custody_type",
  "holding_count",
  "purchase_price",
  "current_price",
  "dividend_per_share",
] as const);
export type FindingField = (typeof FINDING_FIELDS)[number];
export type FindingSeverity = "error" | "warning";
export interface FindingPosition {
  readonly row?: number;
  readonly column?: number;
  readonly field?: FindingField;
}
export interface Finding extends FindingPosition {
  readonly code: FindingCode;
  readonly severity: FindingSeverity;
  readonly message: string;
}
export interface FindingCounts {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly totalCount: number;
  readonly returnedCount: number;
  readonly truncated: boolean;
}
export interface FindingSummary extends FindingCounts {
  readonly findings: readonly Finding[];
}
export interface InspectionLimits {
  readonly maxBytes: number;
  readonly maxDataRows: number;
  readonly maxColumns: number;
  readonly maxReturnedFindings: number;
}
export const DEFAULT_INSPECTION_LIMITS: InspectionLimits = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxDataRows: 10000,
  maxColumns: 100,
  maxReturnedFindings: 200,
});
export const HOLDINGS_PROFILE = "domestic_cash_holdings_v1";
export const HOLDINGS_HEADER = Object.freeze([
  "銘柄",
  "銘柄",
  "銘柄",
  "預り区分",
  "保有株数",
  "取得単価",
  "現在値",
  "現在値",
  "評価損益",
  "評価損益(%)",
  "買付金額",
  "評価額",
  "前日終値",
  "前日比",
  "前日比(%)",
  "評価額前日比",
  "予想PER(倍)",
  "実績PBR(倍)",
  "予想配当利回り(%)",
  "予想EPS",
  "実績BPS",
  "予想1株配当",
] as const);
export type CsvEncoding = "utf-8" | "cp932" | null;
export interface CsvRecord {
  readonly row: number;
  readonly cells: readonly string[];
}
export interface LimitRejection {
  readonly kind: "rejected";
  readonly reason:
    | "maxBytes"
    | "maxDataRows"
    | "maxColumns"
    | "invalid_input"
    | "invalid_limits"
    | "invalid_stock_master";
}
/** Internal intermediate data. Never send records to the browser or logs. No value validation yet. */
export interface StructureInspection extends FindingSummary {
  readonly kind: "structure";
  readonly encoding: CsvEncoding;
  readonly profile: typeof HOLDINGS_PROFILE | null;
  readonly records: readonly CsvRecord[];
  /** Completed, nonempty data records; zero before CSV parsing. */
  readonly rowsScanned: number;
}
export type StructureResult = LimitRejection | StructureInspection;

export interface StockMasterSector {
  readonly code: string;
  readonly name: string;
}
export interface StockMasterEntry {
  readonly sector17: StockMasterSector | null;
  readonly sector33: StockMasterSector | null;
}
/** Validated by the server function. Inspection uses only has(), never sector values. */
export type StockMaster = ReadonlyMap<string, StockMasterEntry>;
export type StockCodeMatch =
  | { readonly status: "not_checked" }
  | {
      readonly status: "checked";
      readonly unknownCodes: readonly string[];
      readonly unknownCount: number;
    };
export interface HoldingsInspection extends FindingSummary {
  readonly kind: "inspection";
  readonly valid: boolean;
  readonly profile: typeof HOLDINGS_PROFILE | null;
  readonly encoding: CsvEncoding;
  readonly rowsScanned: number;
  readonly stockCodeMatch: StockCodeMatch;
}
