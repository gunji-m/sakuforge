import { expect, test } from "vitest";
import { type InspectResponse, parseInspectResponse } from "./api-response";
import { MESSAGES } from "./messages";
import { type Action, INITIAL_STATE, reduce, type State, toStoredResult } from "./screen-state";
import type { StoredResult } from "./storage";
import { aggregated, aggregation, inspection, inspectionFailed, stockMaster } from "./test-data";

const savedAt = "2026-11-12T09:00:00.000Z";

function response(body: unknown): InspectResponse {
  const parsed = parseInspectResponse(body);
  if (parsed === null) throw new Error("合成テストデータが不正です");
  return parsed;
}

function stored(body: unknown = aggregated(), at = savedAt): StoredResult {
  const parsed = response(body);
  if (parsed.result !== "aggregated") throw new Error("合成テストデータが不正です");
  return toStoredResult(parsed, at);
}

/** Starts an import and finishes it with the given body, saving as the screen does. */
function finished(state: State, body: unknown, saveOk = true): State {
  const parsed = response(body);
  const action: Action =
    parsed.result === "aggregated"
      ? {
          type: "finished",
          outcome: { kind: "response", response: parsed },
          saved: { entry: toStoredResult(parsed, savedAt), ok: saveOk },
        }
      : { type: "finished", outcome: { kind: "response", response: parsed } };
  return reduce(reduce(state, { type: "started" }), action);
}

const empty = reduce(INITIAL_STATE, { type: "restored", stored: null });
const shown = finished(empty, aggregated());

const unknownCodes = aggregated({
  inspection: inspection({
    findings: [{ code: "stock_code_unknown", severity: "warning", message: "合成の注意の文言" }],
    warningCount: 1,
    totalCount: 1,
    returnedCount: 1,
    stockCodeMatch: { status: "checked", unknownCodes: ["9D9D", "9E9E"], unknownCount: 2 },
  }),
});

test("保存を読むまでは、空の案内も結果も出さない", () => {
  expect(INITIAL_STATE).toEqual({ loaded: false, result: null, sending: false, notices: [] });
});

test("保存した結果が無ければ空、あれば最新の 1 件を表示する", () => {
  expect(empty).toEqual({ loaded: true, result: null, sending: false, notices: [] });
  expect(reduce(INITIAL_STATE, { type: "restored", stored: stored() }).result).toEqual({
    aggregation: aggregation(),
    stockMaster,
    rowsScanned: 3,
    savedAt,
  });
});

test("保存する結果は、集計・出典・取り込み日時・件数だけを持つ", () => {
  expect(stored(unknownCodes)).toEqual({
    schemaVersion: 1,
    savedAt,
    aggregation: aggregation(),
    stockMaster,
    summary: { rowsScanned: 3, unknownCount: 2 },
  });
  expect(JSON.stringify(stored(unknownCodes))).not.toContain("9D9D");
});

test("送信を始めると、表示を残したまま送信中になり、通知が消える", () => {
  const withNotice = reduce(shown, { type: "stopped", text: MESSAGES.fileName });
  expect(withNotice.notices).toEqual([{ kind: "message", text: MESSAGES.fileName }]);
  expect(reduce(withNotice, { type: "started" })).toEqual({
    ...shown,
    sending: true,
    notices: [],
  });
});

test("集計できた応答で、今回の結果を表示する", () => {
  expect(shown).toEqual({
    loaded: true,
    sending: false,
    notices: [],
    result: { aggregation: aggregation(), stockMaster, rowsScanned: 3, savedAt },
  });
});

test("未知の証券コードがあれば、結果を表示して注意の帯にコードの一覧を出す", () => {
  const state = finished(empty, unknownCodes);
  expect(state.result).not.toBeNull();
  expect(state.notices).toEqual([
    { kind: "unknown_codes", text: "合成の注意の文言", codes: ["9D9D", "9E9E"] },
  ]);
});

test("保存に失敗しても結果は表示し、保存できなかったことを伝える", () => {
  const state = finished(empty, unknownCodes, false);
  expect(state.result).not.toBeNull();
  expect(state.notices).toEqual([
    { kind: "unknown_codes", text: "合成の注意の文言", codes: ["9D9D", "9E9E"] },
    { kind: "message", text: MESSAGES.storageFailed },
  ]);
});

test.each([
  ["空", empty],
  ["表示", shown],
])("検査NGでは、元の状態（%s）を残して所見を出す", (_name, before) => {
  const state = finished(before, inspectionFailed());
  expect(state.result).toBe(before.result);
  expect(state.sending).toBe(false);
  expect(state.notices).toMatchObject([
    {
      kind: "inspection_failed",
      omitted: 0,
      findings: [{ code: "holding_count_invalid", row: 2 }],
    },
  ]);
});

test("省略された所見の数を伝える", () => {
  const body = inspectionFailed();
  const state = finished(empty, {
    ...body,
    inspection: {
      ...(body.inspection as object),
      totalCount: 250,
      errorCount: 250,
      truncated: true,
    },
  });
  expect(state.notices).toMatchObject([{ kind: "inspection_failed", omitted: 249 }]);
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
  expect(state).toEqual({ ...shown, notices: [{ kind: "message", text }] });
});

test("API の誤りでは、前回の結果を残して応答の message を出す", () => {
  const state = reduce(reduce(shown, { type: "started" }), {
    type: "finished",
    outcome: { kind: "api_error", error: { code: "csv_too_many_rows", message: "合成の固定文言" } },
  });
  expect(state).toEqual({ ...shown, notices: [{ kind: "message", text: "合成の固定文言" }] });
});

test("新しい結果は、前回の結果を置き換える", () => {
  const next = finished(shown, aggregated({ aggregation: aggregation({ totalAssetValue: "1" }) }));
  expect(next.result?.aggregation.totalAssetValue).toBe("1");
});

test("通知は 1 つずつ閉じられ、表示は変わらない", () => {
  const state = finished(empty, unknownCodes, false);
  expect(reduce(state, { type: "notice_closed", index: 0 })).toEqual({
    ...state,
    notices: [{ kind: "message", text: MESSAGES.storageFailed }],
  });
});

test("保存した結果を消すと、空に戻る", () => {
  const withNotice = finished(shown, inspectionFailed());
  expect(reduce(withNotice, { type: "cleared", ok: true })).toEqual(empty);
});

test("消せなかったら、表示を残してそのことを伝える", () => {
  expect(reduce(shown, { type: "cleared", ok: false })).toEqual({
    ...shown,
    notices: [{ kind: "message", text: MESSAGES.clearFailed }],
  });
});
