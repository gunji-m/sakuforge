import type { HoldingsCsvResult } from "@sakuforge/core";
import type { CurrentStockMasterRejectionReason } from "./current-stock-master";
import { RESPONSE_SCHEMA_VERSION } from "./response";

export const ERRORS = {
  csv_too_large: {
    status: 413,
    message: "CSVが大きすぎます。4 MiB以下のファイルを選んでください。",
  },
  unsupported_media_type: {
    status: 415,
    message: "CSVファイルとして送ってください。",
  },
  csv_too_many_rows: {
    status: 422,
    message: "保有銘柄の行が多すぎます。10,000行以下にしてください。",
  },
  csv_too_many_columns: {
    status: 422,
    message: "CSVの列が多すぎます。",
  },
  request_body_unreadable: {
    status: 400,
    message: "CSVを受け取れませんでした。もう一度送ってください。",
  },
  internal_error: {
    status: 500,
    message: "処理できませんでした。時間をおいて再度お試しください。",
  },
} as const;

export function errorResponse(code: keyof typeof ERRORS): Response {
  const { status, message } = ERRORS[code];
  return Response.json(
    { schemaVersion: RESPONSE_SCHEMA_VERSION, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

type CoreRejection = Extract<HoldingsCsvResult, { kind: "rejected" | "aggregation_rejected" }>;

/**
 * Why a request ended in `internal_error`. Each is a fixed word built only from fixed codes, so
 * the log line never carries CSV content, asset values, file names or exception text (#97).
 */
export type InternalErrorReason =
  | `stock_master_${CurrentStockMasterRejectionReason}`
  | `core_${CoreRejection["reason"]}`
  | "unexpected_result"
  | "exception";

/** Logs one fixed word for the operator, then returns the fixed `internal_error` answer. */
export function internalError(reason: InternalErrorReason): Response {
  console.error(`internal_error ${reason}`);
  return errorResponse("internal_error");
}
