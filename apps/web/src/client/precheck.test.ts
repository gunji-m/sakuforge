import { expect, test } from "vitest";
import { MAX_CSV_BYTES, precheckFile } from "./precheck";

test.each(["holdings.csv", "保有資産 2026-11.CSV", `${"a".repeat(251)}.csv`])(
  "ファイル名 %s を受け付ける",
  (name) => {
    expect(precheckFile(name, 1)).toBe("ok");
  },
);

test.each([
  "holdings.txt",
  "holdings.csv.zip",
  "holdings",
  "",
  "dir/holdings.csv",
  "dir\\holdings.csv",
  "hold\u0000ings.csv",
  "hold\nings.csv",
  `${"a".repeat(252)}.csv`,
])("ファイル名 %j を file_name で止める", (name) => {
  expect(precheckFile(name, 1)).toBe("file_name");
});

test("大きさは上限ちょうどを受け付け、+1 byte を too_large で止める", () => {
  expect(precheckFile("holdings.csv", MAX_CSV_BYTES)).toBe("ok");
  expect(precheckFile("holdings.csv", MAX_CSV_BYTES + 1)).toBe("too_large");
});

test("ファイル名の誤りを、大きさより先に伝える", () => {
  expect(precheckFile("holdings.txt", MAX_CSV_BYTES + 1)).toBe("file_name");
});
