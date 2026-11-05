import type { AggregationRejection, HoldingsAggregation } from "../aggregation/types";
import type { HoldingsInspection, LimitRejection } from "../inspection/types";

export type HoldingsCsvResult =
  | LimitRejection
  | { readonly kind: "inspection_failed"; readonly inspection: HoldingsInspection }
  | {
      readonly kind: "aggregation_rejected";
      readonly inspection: HoldingsInspection;
      readonly reason: AggregationRejection["reason"];
    }
  | {
      readonly kind: "aggregated";
      readonly inspection: HoldingsInspection;
      readonly aggregation: HoldingsAggregation;
    };
