import { expect, test } from "vitest";
import type { SectorComposition, SectorShare } from "./api-response";
import {
  barRows,
  formatPercent,
  OTHER_COLOR,
  SECTOR_COLORS,
  summarizeDonut,
  toHundredths,
} from "./sectors";

function held(code: string | null, ratio: string): SectorShare {
  return code === null
    ? { code: null, name: null, ratio, held: true }
    : { code, name: `合成業種${code}`, ratio, held: true };
}

function unheld(code: string): SectorShare {
  return { code, name: `合成業種${code}`, ratio: "0.00", held: false };
}

function computed(...sectors: SectorShare[]): SectorComposition {
  return { status: "computed", sectors };
}

test.each([
  ["0.00", 0],
  ["0.08", 8],
  ["6.25", 625],
  ["93.68", 9368],
  ["100.00", 10000],
])("構成比 %s を 100 分の 1 % の整数にする", (ratio, expected) => {
  expect(toHundredths(ratio)).toBe(expected);
});

test.each([
  [0, "0.0"],
  [4, "0.0"],
  [5, "0.1"],
  [625, "6.3"],
  [9368, "93.7"],
  [9995, "100.0"],
  [10000, "100.0"],
])("%s を小数 1 桁（四捨五入）の % にする", (hundredths, expected) => {
  expect(formatPercent(hundredths)).toBe(expected);
});

test("ドーナツは保有のある行だけを、応答の順で色分けする", () => {
  const summary = summarizeDonut(
    computed(held("3", "60.00"), held(null, "25.00"), held("12", "15.00"), unheld("2")),
  );
  expect(summary.segments).toEqual([
    { key: "3", label: "合成業種3", hundredths: 6000, color: SECTOR_COLORS[0] },
    { key: "unclassified", label: "未分類", hundredths: 2500, color: SECTOR_COLORS[1] },
    { key: "12", label: "合成業種12", hundredths: 1500, color: SECTOR_COLORS[2] },
  ]);
  expect(summary.otherHundredths).toBe(0);
});

test("色の数を超えた保有のある行は、その他にまとめる", () => {
  const sectors = Array.from({ length: 10 }, (_, index) => held(String(index + 1), "10.00"));
  const summary = summarizeDonut(computed(...sectors, unheld("11")));
  expect(summary.segments).toHaveLength(SECTOR_COLORS.length);
  expect(summary.segments.map(({ color }) => color)).toEqual([...SECTOR_COLORS]);
  expect(summary.segments.every(({ color }) => color !== OTHER_COLOR)).toBe(true);
  expect(summary.otherHundredths).toBe(3000);
});

test("保有業種数と総業種数は、分類済みの行から数える", () => {
  const summary = summarizeDonut(
    computed(held("1", "50.00"), held(null, "30.00"), held("2", "20.00"), unheld("3"), unheld("4")),
  );
  expect(summary.heldCount).toBe(2);
  expect(summary.totalCount).toBe(4);
});

test("上位 3 の合計は、保有のある行の先頭 3 つから作る", () => {
  const summary = summarizeDonut(
    computed(held("1", "40.10"), held("2", "30.20"), held("3", "20.30"), held("4", "9.40")),
  );
  expect(summary.topThreeHundredths).toBe(9060);
  expect(summarizeDonut(computed(held("1", "100.00"))).topThreeHundredths).toBe(10000);
});

test("計算不可の構成は、空のドーナツと空の横棒になる", () => {
  const empty: SectorComposition = { status: "not_computable", sectors: [] };
  expect(summarizeDonut(empty)).toEqual({
    segments: [],
    otherHundredths: 0,
    heldCount: 0,
    totalCount: 0,
    topThreeHundredths: 0,
  });
  expect(barRows(empty)).toEqual([]);
});

test("横棒は応答の順で、最大の行を 100 として長さを決め、保有なしを区別する", () => {
  expect(
    barRows(computed(held("1", "80.00"), held(null, "20.00"), held("5", "0.00"), unheld("2"))),
  ).toEqual([
    { key: "1", label: "合成業種1", held: true, percent: "80.0", width: 100 },
    { key: "unclassified", label: "未分類", held: true, percent: "20.0", width: 25 },
    { key: "5", label: "合成業種5", held: true, percent: "0.0", width: 0 },
    { key: "2", label: "合成業種2", held: false, percent: "0.0", width: 0 },
  ]);
});

test("すべての構成比が 0 でも、横棒の長さを計算できる", () => {
  expect(barRows(computed(held("1", "0.00"), unheld("2"))).map(({ width }) => width)).toEqual([
    0, 0,
  ]);
});
