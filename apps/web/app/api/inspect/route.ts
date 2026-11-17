import { DEFAULT_INSPECTION_LIMITS, inspectAndAggregateHoldingsCsv } from "@sakuforge/core";
import { loadCurrentStockMaster } from "../../../src/server/current-stock-master";
import { errorResponse, internalError } from "../../../src/server/errors";
import { readBody } from "../../../src/server/read-body";
import { aggregatedResponse, inspectionFailedResponse } from "../../../src/server/response";

// Worst synthetic input finished within 3.1 s on Vercel (#20); allow 10 s.
// Pin the function to the Tokyo region (#114).
export const maxDuration = 10;
export const preferredRegion = "hnd1";

export async function POST(request: Request): Promise<Response> {
  try {
    const mediaType = (request.headers.get("Content-Type") ?? "")
      .split(";", 1)[0]
      ?.trim()
      .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    if (mediaType !== "text/csv" && mediaType !== "application/vnd.ms-excel") {
      return errorResponse("unsupported_media_type");
    }

    // Never hand the core a stock master that failed validation, and never read the body for it.
    const loaded = loadCurrentStockMaster(new Date());
    if (loaded.kind !== "loaded") return internalError(`stock_master_${loaded.reason}`);
    let body: Awaited<ReturnType<typeof readBody>>;
    try {
      body = await readBody(request.body, DEFAULT_INSPECTION_LIMITS.maxBytes);
    } catch {
      return errorResponse("request_body_unreadable");
    }
    if (body.kind === "too_large") return errorResponse("csv_too_large");

    const result = inspectAndAggregateHoldingsCsv(body.bytes, loaded.stockMaster);
    switch (result.kind) {
      case "aggregated":
        return aggregatedResponse(result.inspection, result.aggregation, loaded);
      case "inspection_failed":
        return inspectionFailedResponse(result.inspection, loaded);
      case "rejected":
        switch (result.reason) {
          case "maxBytes":
            return errorResponse("csv_too_large");
          case "maxDataRows":
            return errorResponse("csv_too_many_rows");
          case "maxColumns":
            return errorResponse("csv_too_many_columns");
          default:
            return internalError(`core_${result.reason}`);
        }
      case "aggregation_rejected":
        return internalError(`core_${result.reason}`);
      default:
        return internalError("unexpected_result");
    }
  } catch {
    return internalError("exception");
  }
}
