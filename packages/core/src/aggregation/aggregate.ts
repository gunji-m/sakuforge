import Decimal from "decimal.js";
import type { StockMaster, StockMasterSector } from "../inspection/types";
import { checkStockCode, parseDividendPerShare, parseHoldingNumber } from "../inspection/values";
import type {
  AggregationRejection,
  HoldingRow,
  HoldingsAggregation,
  SectorComposition,
  SectorShare,
} from "./types";

const Arithmetic = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_DOWN });

interface SectorTotal {
  readonly sector: StockMasterSector | null;
  value: Decimal;
}

function readSector(
  value: unknown,
  axis: "sector17" | "sector33",
): StockMasterSector | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const { code, name } = value as StockMasterSector;
  if (
    typeof code !== "string" ||
    !(axis === "sector17" ? /^(?:[1-9]|1[0-7])$/ : /^[0-9]{1,4}$/).test(code) ||
    code.trim() !== code ||
    typeof name !== "string"
  )
    return undefined;
  return { code, name };
}

function addSector(
  totals: Map<string | null, SectorTotal>,
  sector: StockMasterSector | null,
  value: Decimal,
): void {
  const code = sector?.code ?? null;
  const existing = totals.get(code);
  if (existing === undefined) totals.set(code, { sector, value });
  else existing.value = existing.value.plus(value);
}

function composition(
  totals: ReadonlyMap<string | null, SectorTotal>,
  total: Decimal,
): SectorComposition {
  if (total.isZero()) return { status: "not_computable", sectors: [] };
  const sectors: SectorShare[] = [...totals.values()].map(({ sector, value }) => {
    const ratio = value
      .times("100")
      .div(total)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2);
    return sector === null
      ? { code: null, name: null, ratio }
      : { code: sector.code, name: sector.name, ratio };
  });
  sectors.sort((left, right) => {
    const byRatio = new Arithmetic(right.ratio).comparedTo(left.ratio);
    if (byRatio !== 0) return byRatio;
    if (left.code === null) return right.code === null ? 0 : 1;
    if (right.code === null) return -1;
    return Number(left.code) - Number(right.code);
  });
  return { status: "computed", sectors };
}

export function aggregateHoldings(
  rows: readonly HoldingRow[],
  stockMaster: StockMaster,
): AggregationRejection | HoldingsAggregation {
  let reason: AggregationRejection["reason"] = "invalid_input";
  try {
    if (!Array.isArray(rows)) return { kind: "rejected", reason };
    reason = "invalid_stock_master";
    if (!(stockMaster instanceof Map)) return { kind: "rejected", reason };
    reason = "invalid_input";

    let totalAssetValue = new Arithmetic("0");
    let lowerDividend = new Arithmetic("0");
    let upperDividend = new Arithmetic("0");
    const sector17Totals = new Map<string | null, SectorTotal>();
    const sector33Totals = new Map<string | null, SectorTotal>();
    for (const row of rows) {
      if (row === null || typeof row !== "object") return { kind: "rejected", reason };
      const { stockCode, holdingCount, currentPrice, dividendPerShare } = row;
      if (
        typeof stockCode !== "string" ||
        checkStockCode(stockCode) !== null ||
        typeof holdingCount !== "string" ||
        typeof currentPrice !== "string" ||
        typeof dividendPerShare !== "string"
      )
        return { kind: "rejected", reason };
      const count = parseHoldingNumber(holdingCount);
      const price = parseHoldingNumber(currentPrice);
      const dividend = parseDividendPerShare(dividendPerShare);
      if (count === null || price === null || dividend === null)
        return { kind: "rejected", reason };

      reason = "invalid_stock_master";
      let sector17: StockMasterSector | null = null;
      let sector33: StockMasterSector | null = null;
      if (stockMaster.has(stockCode)) {
        const entry = stockMaster.get(stockCode);
        if (entry === null || typeof entry !== "object") return { kind: "rejected", reason };
        const parsed17 = readSector(entry.sector17, "sector17");
        const parsed33 = readSector(entry.sector33, "sector33");
        if (parsed17 === undefined || parsed33 === undefined) return { kind: "rejected", reason };
        sector17 = parsed17;
        sector33 = parsed33;
      }
      reason = "invalid_input";

      const shares = new Arithmetic(count);
      const assetValue = shares.times(price);
      totalAssetValue = totalAssetValue.plus(assetValue);
      lowerDividend = lowerDividend.plus(shares.times(dividend.lower));
      upperDividend = upperDividend.plus(shares.times(dividend.upper ?? dividend.lower));
      addSector(sector17Totals, sector17, assetValue);
      addSector(sector33Totals, sector33, assetValue);
    }
    return {
      kind: "aggregation",
      totalAssetValue: totalAssetValue.toFixed(),
      annualDividend: { lower: lowerDividend.toFixed(), upper: upperDividend.toFixed() },
      sector17: composition(sector17Totals, totalAssetValue),
      sector33: composition(sector33Totals, totalAssetValue),
    };
  } catch {
    return { kind: "rejected", reason };
  }
}
