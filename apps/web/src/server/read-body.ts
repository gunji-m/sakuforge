export type BodyReadResult =
  | { readonly kind: "read"; readonly bytes: Uint8Array }
  | { readonly kind: "too_large" };

export async function readBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<BodyReadResult> {
  if (body === null) return { kind: "read", bytes: new Uint8Array(0) };

  // One bounded buffer also avoids retaining an oversized final chunk.
  const bytes = new Uint8Array(maxBytes + 1);
  const reader = body.getReader();
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { kind: "read", bytes: bytes.subarray(0, length) };
      const retained = value.subarray(0, bytes.length - length);
      bytes.set(retained, length);
      length += retained.length;
      if (length > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation failure must not replace the size rejection.
        }
        return { kind: "too_large" };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
