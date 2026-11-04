export interface HoldingRow {
  readonly stockCode: string;
  readonly holdingCount: string;
  readonly currentPrice: string;
  readonly dividendPerShare: string;
}

export interface AggregationRejection {
  readonly kind: "rejected";
  readonly reason: "invalid_input" | "invalid_stock_master";
}

export interface HoldingsAggregation {
  readonly kind: "aggregation";
  readonly totalAssetValue: string;
  readonly annualDividend: { readonly lower: string; readonly upper: string };
  readonly sector17: SectorComposition;
  readonly sector33: SectorComposition;
}

export type SectorComposition =
  | { readonly status: "computed"; readonly sectors: readonly SectorShare[] }
  | { readonly status: "not_computable"; readonly sectors: readonly [] };

export type SectorShare =
  | { readonly code: string; readonly name: string; readonly ratio: string }
  | { readonly code: null; readonly name: null; readonly ratio: string };
