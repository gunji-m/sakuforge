/**
 * Synthetic stock master in the JSON shape of docs/design.md 4.2.
 * Used outside production (local, CI, Preview). Typed as unknown so it is validated like real input.
 */
export const syntheticStockMasterJson: unknown = {
  schemaVersion: 1,
  asOf: "2026-10-31",
  fetchedAt: "2026-11-05T00:00:00Z",
  sourceSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  stocks: [
    {
      code: "9A9A",
      sector17: { code: "1", name: "合成業種1" },
      sector33: { code: "1", name: "合成業種1" },
    },
    {
      code: "9C9C",
      sector17: { code: "2", name: "合成業種2" },
      sector33: { code: "2", name: "合成業種2" },
    },
  ],
};
