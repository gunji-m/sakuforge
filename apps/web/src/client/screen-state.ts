import type { Aggregation, Finding, InspectResponse, StockMasterAttribution } from "./api-response";
import { MESSAGES } from "./messages";
import type { StoredResult } from "./storage";
import type { SubmitOutcome } from "./submit";

export interface ShownResult {
  readonly aggregation: Aggregation;
  readonly stockMaster: StockMasterAttribution;
  readonly rowsScanned: number;
  /** When the browser imported it, ISO 8601 in UTC. */
  readonly savedAt: string;
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
  /** False until the stored results have been read, so the empty guide does not flash. */
  readonly loaded: boolean;
  readonly result: ShownResult | null;
  readonly sending: boolean;
  readonly notices: readonly Notice[];
}

export type Action =
  | { readonly type: "restored"; readonly stored: StoredResult | null }
  | { readonly type: "started" }
  | { readonly type: "stopped"; readonly text: string }
  | {
      readonly type: "finished";
      readonly outcome: SubmitOutcome;
      /** The entry written for an aggregated response, and whether the browser kept it. */
      readonly saved?: { readonly entry: StoredResult; readonly ok: boolean };
    }
  | { readonly type: "cleared"; readonly ok: boolean }
  | { readonly type: "notice_closed"; readonly index: number };

export const INITIAL_STATE: State = { loaded: false, result: null, sending: false, notices: [] };

const FAILURE_TEXT = {
  too_large: MESSAGES.tooLarge,
  timeout: MESSAGES.timeout,
  network: MESSAGES.network,
  invalid: MESSAGES.invalidResponse,
} as const;

function message(text: string): Notice {
  return { kind: "message", text };
}

function shown(stored: StoredResult): ShownResult {
  return {
    aggregation: stored.aggregation,
    stockMaster: stored.stockMaster,
    rowsScanned: stored.summary.rowsScanned,
    savedAt: stored.savedAt,
  };
}

/** The entry to store for an aggregated response (docs/design.md 8.5). */
export function toStoredResult(
  response: Extract<InspectResponse, { result: "aggregated" }>,
  savedAt: string,
): StoredResult {
  const { stockCodeMatch } = response.inspection;
  return {
    schemaVersion: 1,
    savedAt,
    aggregation: response.aggregation,
    stockMaster: response.stockMaster,
    summary: {
      rowsScanned: response.inspection.rowsScanned,
      unknownCount: stockCodeMatch.status === "checked" ? stockCodeMatch.unknownCount : 0,
    },
  };
}

function unknownCodesNotice(response: InspectResponse): Notice | null {
  const { stockCodeMatch, findings } = response.inspection;
  const warning = findings.find(({ code }) => code === "stock_code_unknown");
  if (stockCodeMatch.status !== "checked" || stockCodeMatch.unknownCount === 0 || !warning) {
    return null;
  }
  return { kind: "unknown_codes", text: warning.message, codes: stockCodeMatch.unknownCodes };
}

/** docs/design.md 6.5: a failed import never replaces the result already on screen. */
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "restored":
      return {
        ...state,
        loaded: true,
        result: action.stored === null ? null : shown(action.stored),
      };
    case "started":
      return { ...state, sending: true, notices: [] };
    case "stopped":
      return { ...state, sending: false, notices: [message(action.text)] };
    case "notice_closed":
      return { ...state, notices: state.notices.filter((_, index) => index !== action.index) };
    case "cleared":
      return action.ok
        ? { ...state, result: null, notices: [] }
        : { ...state, notices: [message(MESSAGES.clearFailed)] };
    case "finished": {
      const { outcome, saved } = action;
      if (outcome.kind === "failure") {
        return { ...state, sending: false, notices: [message(FAILURE_TEXT[outcome.reason])] };
      }
      if (outcome.kind === "api_error") {
        return { ...state, sending: false, notices: [message(outcome.error.message)] };
      }
      const { response } = outcome;
      if (response.result === "inspection_failed") {
        const { findings, totalCount, returnedCount } = response.inspection;
        const usesStockMaster = findings.some(({ code }) => code === "stock_code_unknown");
        const notice: Notice = {
          kind: "inspection_failed",
          findings,
          omitted: totalCount - returnedCount,
          stockMaster: usesStockMaster ? response.stockMaster : null,
        };
        return { ...state, sending: false, notices: [notice] };
      }
      // A complete result is shown even when the browser could not keep it.
      if (saved === undefined) return { ...state, sending: false };
      const notices: Notice[] = [];
      const unknown = unknownCodesNotice(response);
      if (unknown !== null) notices.push(unknown);
      if (!saved.ok) notices.push(message(MESSAGES.storageFailed));
      return { ...state, sending: false, notices, result: shown(saved.entry) };
    }
  }
}
