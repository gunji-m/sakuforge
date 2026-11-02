import type { CsvEncoding, LimitRejection } from "./types";

type DecodeResult =
  | { readonly kind: "decoded"; readonly text: string; readonly encoding: CsvEncoding }
  | { readonly kind: "unsupported" }
  | LimitRejection;

export function decodeCsv(input: Uint8Array | string, maxBytes: number): DecodeResult {
  if (typeof input === "string") {
    return { kind: "decoded", text: stripBom(input), encoding: null };
  }
  if (!(input instanceof Uint8Array)) return { kind: "rejected", reason: "invalid_input" };
  if (input.byteLength > maxBytes) return { kind: "rejected", reason: "maxBytes" };
  for (const [label, encoding] of [
    ["utf-8", "utf-8"],
    ["shift_jis", "cp932"],
  ] as const) {
    try {
      const text = new TextDecoder(label, { fatal: true }).decode(input);
      // The standard UTF-8 decoder consumes its leading BOM itself. Do not strip a second one.
      return { kind: "decoded", text, encoding };
    } catch {
      // Try only the next supported encoding. Never expose decoder exception text.
    }
  }
  return { kind: "unsupported" };
}

function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}
