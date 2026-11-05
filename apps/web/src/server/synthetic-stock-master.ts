import type { StockMaster, StockMasterEntry } from "@sakuforge/core";

const first: StockMasterEntry = {
  sector17: { code: "1", name: "合成業種1" },
  sector33: { code: "1", name: "合成業種1" },
};
const second: StockMasterEntry = {
  sector17: { code: "2", name: "合成業種2" },
  sector33: { code: "2", name: "合成業種2" },
};

export const syntheticStockMaster: StockMaster = new Map([
  ["9A9A", first],
  ["9C9C", second],
]);
