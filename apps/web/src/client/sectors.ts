import type { SectorComposition, SectorShare } from "./api-response";

/** Donut colours for the largest held sectors; the rest share OTHER_COLOR. */
export const SECTOR_COLORS = [
  "#2a5db0",
  "#2e8b57",
  "#d08a2e",
  "#8a5fb5",
  "#c75050",
  "#3aa6a6",
  "#b8a23a",
] as const;
export const OTHER_COLOR = "#d9dee3";
export const UNCLASSIFIED_LABEL = "未分類";

/** A ratio such as "93.68" as hundredths of a percent. Ratios have exactly two decimals. */
export function toHundredths(ratio: string): number {
  return Number(ratio.replace(".", ""));
}

/** Hundredths of a percent as text with one decimal, rounded half up: 9368 -> "93.7". */
export function formatPercent(hundredths: number): string {
  const tenths = Math.floor((hundredths + 5) / 10);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

export function sectorLabel(sector: SectorShare): string {
  return sector.name ?? UNCLASSIFIED_LABEL;
}

export interface DonutSegment {
  readonly key: string;
  readonly label: string;
  readonly hundredths: number;
  readonly color: string;
}

export interface DonutSummary {
  /** The largest held rows, at most one per colour. */
  readonly segments: readonly DonutSegment[];
  /** Held rows beyond the coloured ones, summed. Zero when there are none. */
  readonly otherHundredths: number;
  /** Classified sectors with holdings, and all classified sectors the stock master knows. */
  readonly heldCount: number;
  readonly totalCount: number;
  readonly topThreeHundredths: number;
}

/**
 * What the donut shows. Sectors without holdings are left out; rows keep the API's order, which
 * already sorts held rows by ratio (docs/domain-rules.md 7).
 */
export function summarizeDonut(composition: SectorComposition): DonutSummary {
  const held = composition.sectors.filter((sector) => sector.held);
  const classified = composition.sectors.filter((sector) => sector.code !== null);
  const segments = held.slice(0, SECTOR_COLORS.length).map((sector, index) => ({
    key: sector.code ?? "unclassified",
    label: sectorLabel(sector),
    hundredths: toHundredths(sector.ratio),
    color: SECTOR_COLORS[index] ?? OTHER_COLOR,
  }));
  const sum = (rows: readonly SectorShare[]) =>
    rows.reduce((total, sector) => total + toHundredths(sector.ratio), 0);
  return {
    segments,
    otherHundredths: sum(held.slice(SECTOR_COLORS.length)),
    heldCount: classified.filter((sector) => sector.held).length,
    totalCount: classified.length,
    topThreeHundredths: sum(held.slice(0, 3)),
  };
}

export interface BarRow {
  readonly key: string;
  readonly label: string;
  readonly held: boolean;
  /** One decimal, for display. */
  readonly percent: string;
  /** Bar length relative to the largest row, 0 to 100. */
  readonly width: number;
}

/** One row per sector in the API's order: held rows first, then sectors without holdings. */
export function barRows(composition: SectorComposition): readonly BarRow[] {
  const largest = Math.max(0, ...composition.sectors.map((sector) => toHundredths(sector.ratio)));
  return composition.sectors.map((sector) => {
    const hundredths = toHundredths(sector.ratio);
    return {
      key: sector.code ?? "unclassified",
      label: sectorLabel(sector),
      held: sector.held,
      percent: formatPercent(hundredths),
      width: largest === 0 ? 0 : Math.round((hundredths / largest) * 1000) / 10,
    };
  });
}
