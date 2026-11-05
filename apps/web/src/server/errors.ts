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
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
