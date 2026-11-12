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

/**
 * One row of a composition. Sectors in the stock master that hold nothing are listed after the held
 * rows with ratio "0.00" and held false; a held sector that rounds to "0.00" keeps held true.
 */
export type SectorShare =
  | {
      readonly code: string;
      readonly name: string;
      readonly ratio: string;
      readonly held: boolean;
    }
  | { readonly code: null; readonly name: null; readonly ratio: string; readonly held: true };
