import { expect, test } from "vitest";
import { type InspectResponse, parseInspectResponse } from "./api-response";
import { MESSAGES } from "./messages";
import { INITIAL_STATE, reduce, type State } from "./screen-state";
import { aggregated, aggregation, inspection, inspectionFailed } from "./test-data";

function response(body: unknown): InspectResponse {
  const parsed = parseInspectResponse(body);
  if (parsed === null) throw new Error("合成テストデータが不正です");
  return parsed;
}

function finished(state: State, body: unknown): State {
  return reduce(reduce(state, { type: "started" }), {
    type: "finished",
    outcome: { kind: "response", response: response(body) },
  });
}

const shown = finished(INITIAL_STATE, aggregated());

test("最初は空で、送信中でも通知でもない", () => {
  expect(INITIAL_STATE).toEqual({ result: null, sending: false, notice: null });
});

test("送信を始めると、表示を残したまま送信中になり、通知が消える", () => {
  const withNotice = reduce(shown, {
    type: "stopped",
    notice: { kind: "message", text: MESSAGES.fileName },
  });
  expect(reduce(withNotice, { type: "started" })).toEqual({
    result: shown.result,
    sending: true,
    notice: null,
  });
});

test("集計できた応答で、今回の結果を表示する", () => {
  expect(shown).toEqual({
    sending: false,
    notice: null,
    result: {
      aggregation: aggregation(),
      stockMaster: { source: "合成データ", asOf: "2026-10-31" },
      rowsScanned: 3,
    },
  });
});

test("未知の証券コードがあれば、結果を表示して注意の帯にコードの一覧を出す", () => {
  const warning = {
    code: "stock_code_unknown",
    severity: "warning",
    message: "合成の注意の文言",
  };
  const state = finished(
    INITIAL_STATE,
    aggregated({
      inspection: inspection({
        findings: [warning],
        warningCount: 1,
        totalCount: 1,
        returnedCount: 1,
        stockCodeMatch: { status: "checked", unknownCodes: ["9D9D", "9E9E"], unknownCount: 2 },
      }),
    }),
  );
  expect(state.result).not.toBeNull();
  expect(state.notice).toEqual({
    kind: "unknown_codes",
    text: "合成の注意の文言",
    codes: ["9D9D", "9E9E"],
  });
});

test.each([
  ["空", INITIAL_STATE],
  ["表示", shown],
])("検査NGでは、元の状態（%s）を残して所見を出す", (_name, before) => {
  const state = finished(before, inspectionFailed());
  expect(state.result).toBe(before.result);
  expect(state.sending).toBe(false);
  expect(state.notice).toMatchObject({
    kind: "inspection_failed",
    omitted: 0,
    findings: [{ code: "holding_count_invalid", row: 2 }],
  });
});

test("省略された所見の数を伝える", () => {
  const body = inspectionFailed();
  const state = finished(INITIAL_STATE, {
    ...body,
    inspection: {
      ...(body.inspection as object),
      totalCount: 250,
      errorCount: 250,
      truncated: true,
    },
  });
  expect(state.notice).toMatchObject({ kind: "inspection_failed", omitted: 249 });
});

test.each([
  ["too_large", MESSAGES.tooLarge],
  ["timeout", MESSAGES.timeout],
  ["network", MESSAGES.network],
  ["invalid", MESSAGES.invalidResponse],
] as const)("失敗（%s）では、前回の結果を残して固定の文言を出す", (reason, text) => {
  const state = reduce(reduce(shown, { type: "started" }), {
    type: "finished",
    outcome: { kind: "failure", reason },
  });
  expect(state).toEqual({
    result: shown.result,
    sending: false,
    notice: { kind: "message", text },
  });
});

test("API の誤りでは、前回の結果を残して応答の message を出す", () => {
  const state = reduce(reduce(shown, { type: "started" }), {
    type: "finished",
    outcome: { kind: "api_error", error: { code: "csv_too_many_rows", message: "合成の固定文言" } },
  });
  expect(state).toEqual({
    result: shown.result,
    sending: false,
    notice: { kind: "message", text: "合成の固定文言" },
  });
});

test("新しい結果は、前回の結果を置き換える", () => {
  const next = finished(shown, aggregated({ aggregation: aggregation({ totalAssetValue: "1" }) }));
  expect(next.result?.aggregation.totalAssetValue).toBe("1");
});

test("通知は閉じられ、表示は変わらない", () => {
  const state = finished(shown, inspectionFailed());
  expect(reduce(state, { type: "notice_closed" })).toEqual({ ...state, notice: null });
});
