import { expect, test, vi } from "vitest";
import { readBody } from "./read-body";

function streamOf(chunks: readonly Uint8Array[]) {
  let pulls = 0;
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[pulls++];
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  return { stream, cancel, pulls: () => pulls };
}

test("上限ちょうどの本文は全量を返す", async () => {
  const source = streamOf([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
  expect(await readBody(source.stream, 4)).toEqual({
    kind: "read",
    bytes: new Uint8Array([1, 2, 3, 4]),
  });
  expect(source.cancel).not.toHaveBeenCalled();
});

test("上限+1でcancelし、それ以降のチャンクをpullしない", async () => {
  const source = streamOf([new Uint8Array(4), new Uint8Array(1), new Uint8Array(1)]);
  expect(await readBody(source.stream, 4)).toEqual({ kind: "too_large" });
  expect(source.cancel).toHaveBeenCalledOnce();
  expect(source.pulls()).toBe(2);
  expect(source.stream.locked).toBe(false);
});

test("上限をまたぐチャンクは上限+1まで切り詰めて拒否する", async () => {
  const source = streamOf([new Uint8Array([1, 2, 3]), new Uint8Array(100), new Uint8Array(1)]);
  expect(await readBody(source.stream, 4)).toEqual({ kind: "too_large" });
  expect(source.cancel).toHaveBeenCalledOnce();
  expect(source.pulls()).toBe(2);
});

test("本文がnullなら空のUint8Arrayを返す", async () => {
  expect(await readBody(null, 4)).toEqual({ kind: "read", bytes: new Uint8Array(0) });
});

test("cancelが失敗してもサイズ超過を返す", async () => {
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.enqueue(new Uint8Array(5));
      },
      cancel() {
        throw new Error("合成cancel例外");
      },
    },
    { highWaterMark: 0 },
  );
  expect(await readBody(stream, 4)).toEqual({ kind: "too_large" });
  expect(stream.locked).toBe(false);
});
