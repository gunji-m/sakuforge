import { expect, test } from "vitest";
import { decodeCsv } from "./decode";

test.each([
  [new Uint8Array([0x41, 0xe3, 0x81, 0x82]), "Aあ"],
  [new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), "A"],
  [new Uint8Array([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, 0x41]), "\uFEFFA"],
] as const)("UTF-8 is tried first, with only the leading BOM removed", (bytes, text) => {
  expect(decodeCsv(bytes, bytes.length)).toEqual({ kind: "decoded", text, encoding: "utf-8" });
});

test("Shift_JIS decoding includes CP932 extensions", () => {
  expect(decodeCsv(new Uint8Array([0x82, 0xa0, 0x87, 0x40]), 4)).toEqual({
    kind: "decoded",
    text: "あ①",
    encoding: "cp932",
  });
});

test("both fatal decoders reject a dangling lead byte", () => {
  expect(decodeCsv(new Uint8Array([0x81]), 1)).toEqual({ kind: "unsupported" });
});

test("size is checked before decode, including BOM bytes", () => {
  expect(decodeCsv(new Uint8Array([0x81, 0x81]), 1)).toEqual({
    kind: "rejected",
    reason: "maxBytes",
  });
  expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf]), 2)).toEqual({
    kind: "rejected",
    reason: "maxBytes",
  });
});

test("string input is not decoded or measured in bytes and loses only its first BOM", () => {
  expect(decodeCsv("\uFEFF\uFEFFsynthetic", 0)).toEqual({
    kind: "decoded",
    text: "\uFEFFsynthetic",
    encoding: null,
  });
  expect(decodeCsv("synthetic\uFEFF", 0)).toEqual({
    kind: "decoded",
    text: "synthetic\uFEFF",
    encoding: null,
  });
});
