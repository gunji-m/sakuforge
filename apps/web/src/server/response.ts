import type { HoldingsAggregation, HoldingsInspection, SectorComposition } from "@sakuforge/core";

/** Version of the response and of the JSON the browser stores (docs/design.md 8.6). */
export const RESPONSE_SCHEMA_VERSION = 1;

export interface StockMasterAttribution {
  readonly source: string;
  /** Reference date of the source list, YYYY-MM-DD. */
  readonly asOf: string;
}

const HEADERS = { "Cache-Control": "no-store" } as const;

// Copy field by field: a value the core adds later must not reach the browser unreviewed.
function inspectionBody(inspection: HoldingsInspection) {
  const { stockCodeMatch } = inspection;
  return {
    valid: inspection.valid,
    profile: inspection.profile,
    encoding: inspection.encoding,
    rowsScanned: inspection.rowsScanned,
    findings: inspection.findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      message: finding.message,
      ...(finding.row === undefined ? {} : { row: finding.row }),
      ...(finding.column === undefined ? {} : { column: finding.column }),
      ...(finding.field === undefined ? {} : { field: finding.field }),
    })),
    errorCount: inspection.errorCount,
    warningCount: inspection.warningCount,
    totalCount: inspection.totalCount,
    returnedCount: inspection.returnedCount,
    truncated: inspection.truncated,
    stockCodeMatch:
      stockCodeMatch.status === "checked"
        ? {
            status: stockCodeMatch.status,
            unknownCodes: [...stockCodeMatch.unknownCodes],
            unknownCount: stockCodeMatch.unknownCount,
          }
        : { status: stockCodeMatch.status },
  };
}

function compositionBody(composition: SectorComposition) {
  return {
    status: composition.status,
    sectors: composition.sectors.map(({ code, name, ratio }) => ({ code, name, ratio })),
  };
}

function aggregationBody(aggregation: HoldingsAggregation) {
  return {
    totalAssetValue: aggregation.totalAssetValue,
    annualDividend: {
      lower: aggregation.annualDividend.lower,
      upper: aggregation.annualDividend.upper,
    },
    sector17: compositionBody(aggregation.sector17),
    sector33: compositionBody(aggregation.sector33),
  };
}

function stockMasterBody({ source, asOf }: StockMasterAttribution) {
  return { source, asOf };
}

export function aggregatedResponse(
  inspection: HoldingsInspection,
  aggregation: HoldingsAggregation,
  stockMaster: StockMasterAttribution,
): Response {
  return Response.json(
    {
      schemaVersion: RESPONSE_SCHEMA_VERSION,
      result: "aggregated",
      inspection: inspectionBody(inspection),
      aggregation: aggregationBody(aggregation),
      stockMaster: stockMasterBody(stockMaster),
    },
    { headers: HEADERS },
  );
}

export function inspectionFailedResponse(
  inspection: HoldingsInspection,
  stockMaster: StockMasterAttribution,
): Response {
  return Response.json(
    {
      schemaVersion: RESPONSE_SCHEMA_VERSION,
      result: "inspection_failed",
      inspection: inspectionBody(inspection),
      stockMaster: stockMasterBody(stockMaster),
    },
    { headers: HEADERS },
  );
}
