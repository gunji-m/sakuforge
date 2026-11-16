/** Test data only: a synthetic stock master in the real shape and size. */

/** A synthetic master large enough for the default limits (1,000 stocks: 9000-9999). */
export function syntheticRealSizedMaster(asOf = "2026-09-30"): unknown {
  return {
    schemaVersion: 1,
    asOf,
    fetchedAt: "2026-10-05T00:00:00Z",
    sourceSha256: "0".repeat(64),
    stocks: Array.from({ length: 1000 }, (_, index) => ({
      code: String(9000 + index),
      sector17: { code: String((index % 17) + 1), name: `合成業種${(index % 17) + 1}` },
      sector33: { code: String((index % 33) + 1), name: `合成業種${(index % 33) + 1}` },
    })),
  };
}
