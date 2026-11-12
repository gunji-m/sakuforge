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
 * Sends the CSV bytes only: no file name, no multipart (docs/design.md 8.1).
 * Only a complete, well-formed 200 becomes a result (docs/design.md 7, row 5).
 */
export async function submitCsv(body: Blob, fetcher: Fetch): Promise<SubmitOutcome> {
  let response: Response;
  try {
    response = await fetcher("/api/inspect", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body,
      cache: "no-store",
      credentials: "omit",
    });
  } catch {
    return { kind: "failure", reason: "network" };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }
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
  if (response.status === 504) return { kind: "failure", reason: "timeout" };
  return { kind: "failure", reason: "invalid" };
}
