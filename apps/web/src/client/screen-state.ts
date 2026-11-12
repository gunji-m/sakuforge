import type { Aggregation, Finding, InspectResponse, StockMasterAttribution } from "./api-response";
import { MESSAGES } from "./messages";
import type { SubmitOutcome } from "./submit";

export interface ShownResult {
  readonly aggregation: Aggregation;
  readonly stockMaster: StockMasterAttribution;
  readonly rowsScanned: number;
}

export type Notice =
  | { readonly kind: "message"; readonly text: string }
  | {
      readonly kind: "inspection_failed";
      readonly findings: readonly Finding[];
      readonly omitted: number;
      /** Set when a finding comes from the stock master, which must carry its source and date. */
      readonly stockMaster: StockMasterAttribution | null;
    }
  | { readonly kind: "unknown_codes"; readonly text: string; readonly codes: readonly string[] };

export interface State {
  readonly result: ShownResult | null;
  readonly sending: boolean;
  readonly notice: Notice | null;
}

export type Action =
  | { readonly type: "started" }
  | { readonly type: "stopped"; readonly notice: Notice }
  | { readonly type: "finished"; readonly outcome: SubmitOutcome }
  | { readonly type: "notice_closed" };

export const INITIAL_STATE: State = { result: null, sending: false, notice: null };

const FAILURE_TEXT = {
  too_large: MESSAGES.tooLarge,
  timeout: MESSAGES.timeout,
  network: MESSAGES.network,
  invalid: MESSAGES.invalidResponse,
} as const;

function noticeForResponse(response: InspectResponse): Notice | null {
  const { inspection } = response;
  if (response.result === "inspection_failed") {
    const usesStockMaster = inspection.findings.some(({ code }) => code === "stock_code_unknown");
    return {
      kind: "inspection_failed",
      findings: inspection.findings,
      omitted: inspection.totalCount - inspection.returnedCount,
      stockMaster: usesStockMaster ? response.stockMaster : null,
    };
  }
  const { stockCodeMatch } = inspection;
  const warning = inspection.findings.find(({ code }) => code === "stock_code_unknown");
  if (stockCodeMatch.status !== "checked" || stockCodeMatch.unknownCount === 0 || !warning) {
    return null;
  }
  return { kind: "unknown_codes", text: warning.message, codes: stockCodeMatch.unknownCodes };
}

/** docs/design.md 6.5: a failed import never replaces the result already on screen. */
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "started":
      return { ...state, sending: true, notice: null };
    case "stopped":
      return { ...state, sending: false, notice: action.notice };
    case "notice_closed":
      return { ...state, notice: null };
    case "finished": {
      const { outcome } = action;
      if (outcome.kind === "failure") {
        return {
          ...state,
          sending: false,
          notice: { kind: "message", text: FAILURE_TEXT[outcome.reason] },
        };
      }
      if (outcome.kind === "api_error") {
        return {
          ...state,
          sending: false,
          notice: { kind: "message", text: outcome.error.message },
        };
      }
      const { response } = outcome;
      const notice = noticeForResponse(response);
      if (response.result === "inspection_failed") return { ...state, sending: false, notice };
      return {
        sending: false,
        notice,
        result: {
          aggregation: response.aggregation,
          stockMaster: response.stockMaster,
          rowsScanned: response.inspection.rowsScanned,
        },
      };
    }
  }
}
