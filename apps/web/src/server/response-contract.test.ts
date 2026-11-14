/**
 * The screen reads the API's JSON with its own parsers so that the core never ships to
 * the browser. These tests pass what the server function actually returns through those
 * parsers, so that the two sides cannot drift apart unnoticed (docs/design.md section 8).
 */
import { DEFAULT_INSPECTION_LIMITS } from "@sakuforge/core";
import { expect, test } from "vitest";
import { POST } from "../../app/api/inspect/route";
import {
  parseApiError,
  parseInspectResponse,
  SUPPORTED_SCHEMA_VERSION,
} from "../client/api-response";
import { MAX_CSV_BYTES } from "../client/precheck";
import { ERRORS, errorResponse } from "./errors";
import { RESPONSE_SCHEMA_VERSION } from "./response";

const header = "銘柄,保有株数,取得単価,現在値,予想1株配当";

function post(body: string | null, contentType = "text/csv"): Promise<Response> {
  return POST(
    new Request("http://localhost/api/inspect", {
      method: "POST",
      body: body === null ? null : new TextEncoder().encode(body),
      headers: { "Content-Type": contentType },
    }),
  );
}

async function readByScreen(response: Response) {
  const json: Record<string, unknown> = await response.json();
  // The screen checks the version and then keeps everything else, unchanged.
  const { schemaVersion, ...body } = json;
  expect(schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION);
  return { body, parsed: parseInspectResponse(json) };
}

test.each([
  ["集計できた応答", `${header}\n9A9A,100,1000,1200,40`],
  ["未知の証券コードつきの応答", `${header}\n9A9A,100,1000,1200,40\n9D9D,10,500,600,5`],
  ["合計が 0 で構成を計算できない応答", `${header}\n9A9A,0,1000,1200,40`],
])("%sを、画面がそのまま読める", async (_name, csv) => {
  const response = await post(csv);
  expect(response.status).toBe(200);
  const { body, parsed } = await readByScreen(response);
  expect(parsed).not.toBeNull();
  expect(parsed?.result).toBe("aggregated");
  expect(parsed).toEqual(body);
});

test("未知の証券コードは、画面の読み取りの後も一覧と件数が残る", async () => {
  const { parsed } = await readByScreen(await post(`${header}\n9D9D,10,500,600,5`));
  expect(parsed?.inspection.stockCodeMatch).toEqual({
    status: "checked",
    unknownCodes: ["9D9D"],
    unknownCount: 1,
  });
});

test("合計が 0 の応答は、画面の読み取りの後も構成を計算不可のまま持つ", async () => {
  const { parsed } = await readByScreen(await post(`${header}\n9A9A,0,1000,1200,40`));
  if (parsed?.result !== "aggregated") throw new Error("expected aggregated");
  expect(parsed.aggregation.sector17.status).toBe("not_computable");
  expect(parsed.aggregation.sector33.status).toBe("not_computable");
});

test.each([
  ["値の不正による検査 NG", `${header}\n9A9A,-1,1000,1200,40`],
  ["空の CSV による検査 NG", null],
])("%sの応答を、画面がそのまま読める", async (_name, csv) => {
  const response = await post(csv);
  expect(response.status).toBe(200);
  const { body, parsed } = await readByScreen(response);
  expect(parsed).not.toBeNull();
  expect(parsed?.result).toBe("inspection_failed");
  expect(parsed).toEqual(body);
});

test.each(Object.keys(ERRORS) as (keyof typeof ERRORS)[])(
  "検査へ進めなかったときの %s を、画面がそのまま読める",
  async (code) => {
    const response = errorResponse(code);
    expect(response.status).toBe(ERRORS[code].status);
    const body: unknown = await response.json();
    expect(parseApiError(body)).toEqual({ code, message: ERRORS[code].message });
  },
);

test("サーバー関数が返した 415 を、画面がそのまま読める", async () => {
  const response = await post(`${header}\n9A9A,100,1000,1200,40`, "application/json");
  expect(response.status).toBe(415);
  expect(parseApiError(await response.json())).toEqual({
    code: "unsupported_media_type",
    message: ERRORS.unsupported_media_type.message,
  });
});

test("画面が読む応答の版は、サーバー関数が返す版と同じ", () => {
  expect(SUPPORTED_SCHEMA_VERSION).toBe(RESPONSE_SCHEMA_VERSION);
});

test("画面が送る前に確かめる大きさの上限は、核の上限と同じ", () => {
  expect(MAX_CSV_BYTES).toBe(DEFAULT_INSPECTION_LIMITS.maxBytes);
});
