import {
  type ApiError,
  type InspectResponse,
  parseApiError,
  parseInspectResponse,
} from "./api-response";

export type SubmitOutcome =
  | { readonly kind: "response"; readonly response: InspectResponse }
  | { readonly kind: "api_error"; readonly error: ApiError }
  | { readonly kind: "failure"; readonly reason: "too_large" | "timeout" | "network" | "invalid" };

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * The screen's own time limit for one submission, from sending the first byte
 * to reading the whole response (docs/design.md 6.5). The platform waits for
 * the whole body before calling the function, so the upload is not covered by
 * the function's `maxDuration` (10 s, #20) and needs most of this budget.
 */
export const SUBMIT_TIMEOUT_MS = 60_000;

/**
 * Sends the CSV bytes only: no file name, no multipart (docs/design.md 8.1).
 * Only a complete, well-formed 200 becomes a result (docs/design.md 7, row 5).
 * A submission that runs out of time is aborted and never becomes a result.
 */
export async function submitCsv(
  body: Blob,
  fetcher: Fetch,
  timeoutMs: number = SUBMIT_TIMEOUT_MS,
): Promise<SubmitOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await send(body, fetcher, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function send(body: Blob, fetcher: Fetch, signal: AbortSignal): Promise<SubmitOutcome> {
  let response: Response;
  try {
    response = await fetcher("/api/inspect", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body,
      cache: "no-store",
      credentials: "omit",
      signal,
    });
  } catch {
    return signal.aborted ? timedOut : { kind: "failure", reason: "network" };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }
  // Drop whatever arrived once the time is up, even a complete response.
  if (signal.aborted) return timedOut;
  if (response.status === 200) {
    const parsed = parseInspectResponse(json);
    return parsed === null
      ? { kind: "failure", reason: "invalid" }
      : { kind: "response", response: parsed };
  }
  const error = parseApiError(json);
  if (error !== null) return { kind: "api_error", error };
  // The platform answers these itself, not always with JSON.
  if (response.status === 413) return { kind: "failure", reason: "too_large" };
  if (response.status === 504) return timedOut;
  return { kind: "failure", reason: "invalid" };
}

const timedOut: SubmitOutcome = { kind: "failure", reason: "timeout" };
