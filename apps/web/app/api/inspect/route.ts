import { DEFAULT_INSPECTION_LIMITS, inspectAndAggregateHoldingsCsv } from "@sakuforge/core";
import { errorResponse } from "../../../src/server/errors";
import { readBody } from "../../../src/server/read-body";
import { syntheticStockMaster } from "../../../src/server/synthetic-stock-master";

export async function POST(request: Request): Promise<Response> {
  try {
    const mediaType = (request.headers.get("Content-Type") ?? "")
      .split(";", 1)[0]
      ?.trim()
      .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    if (mediaType !== "text/csv" && mediaType !== "application/vnd.ms-excel") {
      return errorResponse("unsupported_media_type");
    }

    let body: Awaited<ReturnType<typeof readBody>>;
    try {
      body = await readBody(request.body, DEFAULT_INSPECTION_LIMITS.maxBytes);
    } catch {
      return errorResponse("request_body_unreadable");
    }
    if (body.kind === "too_large") return errorResponse("csv_too_large");

    const result = inspectAndAggregateHoldingsCsv(body.bytes, syntheticStockMaster);
    switch (result.kind) {
      case "aggregated":
        return Response.json(
          { result: "aggregated", inspection: result.inspection, aggregation: result.aggregation },
          { headers: { "Cache-Control": "no-store" } },
        );
      case "inspection_failed":
        return Response.json(
          { result: "inspection_failed", inspection: result.inspection },
          { headers: { "Cache-Control": "no-store" } },
        );
      case "rejected":
        switch (result.reason) {
          case "maxBytes":
            return errorResponse("csv_too_large");
          case "maxDataRows":
            return errorResponse("csv_too_many_rows");
          case "maxColumns":
            return errorResponse("csv_too_many_columns");
          default:
            return errorResponse("internal_error");
        }
      default:
        return errorResponse("internal_error");
    }
  } catch {
    return errorResponse("internal_error");
  }
}

export const runtime = "bogus";
