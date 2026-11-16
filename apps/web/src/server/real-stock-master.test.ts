import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import configFor from "../../next.config";
import { STOCK_MASTER_FILE } from "../../scripts/fetch-stock-master.mjs";
import {
  loadCurrentStockMaster,
  REAL_STOCK_MASTER_FILE,
  SYNTHETIC_STOCK_MASTER_SOURCE,
  TSE_STOCK_MASTER_SOURCE,
} from "./current-stock-master";
import { syntheticRealSizedMaster } from "./test-stock-master";

const now = new Date("2026-11-12T00:00:00Z");
const production = { VERCEL_ENV: "production" };

test("本番では、読み込んだ JSON を検証し、東証の出典と JSON の基準日を付ける", () => {
  const result = loadCurrentStockMaster(now, production, () => syntheticRealSizedMaster());
  expect(result.kind).toBe("loaded");
  if (result.kind !== "loaded") return;
  expect(result.source).toBe(TSE_STOCK_MASTER_SOURCE);
  expect(result.asOf).toBe("2026-09-30");
  expect(result.stockMaster.size).toBe(1000);
});

test("本番で JSON を読めないときは、合成へ落とさず固定の理由で拒否する", () => {
  const result = loadCurrentStockMaster(now, production, () => {
    throw new Error("合成例外の秘密文字列");
  });
  expect(result).toEqual({ kind: "rejected", reason: "unreadable" });
});

test("本番では件数の下限を下げない（合成の 2 銘柄の JSON は拒否する）", () => {
  const twoStocks = syntheticRealSizedMaster() as { stocks: unknown[] };
  twoStocks.stocks = twoStocks.stocks.slice(0, 2);
  expect(loadCurrentStockMaster(now, production, () => twoStocks)).toEqual({
    kind: "rejected",
    reason: "stock_count_out_of_range",
  });
});

test("本番で検証に失敗した JSON は、合成へ落とさず拒否する", () => {
  expect(
    loadCurrentStockMaster(now, production, () => syntheticRealSizedMaster("2026-09-29")),
  ).toEqual({ kind: "rejected", reason: "invalid_as_of" });
});

test.each([
  {},
  { VERCEL_ENV: "preview" },
  { VERCEL_ENV: "development" },
  { VERCEL_ENV: "Production" },
  { NODE_ENV: "production" },
])("本番以外（%o）は、本物を読まず合成を使う", (env) => {
  const read = vi.fn(() => syntheticRealSizedMaster());
  const result = loadCurrentStockMaster(now, env, read);
  expect(read).not.toHaveBeenCalled();
  expect(result.kind).toBe("loaded");
  if (result.kind !== "loaded") return;
  expect(result.source).toBe(SYNTHETIC_STOCK_MASTER_SOURCE);
});

test("取得のスクリプトが書く場所と、サーバー関数が読む場所が同じ", () => {
  expect(STOCK_MASTER_FILE).toBe(REAL_STOCK_MASTER_FILE);
});

test("build は取得のスクリプトを next build の前に走らせる", () => {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const scripts = JSON.parse(readFileSync(resolve(webRoot, "package.json"), "utf8")).scripts;
  expect(scripts.build).toBe("node scripts/fetch-stock-master.mjs && next build");
});

describe("本番の build の関門（next.config.ts）", () => {
  let root = "";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sakuforge-build-"));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function place(json: unknown): void {
    mkdirSync(join(root, dirname(REAL_STOCK_MASTER_FILE)), { recursive: true });
    writeFileSync(join(root, REAL_STOCK_MASTER_FILE), JSON.stringify(json));
  }

  test("本番の build で JSON が無ければ、固定の理由で build を失敗させる", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => configFor(PHASE_PRODUCTION_BUILD)).toThrow(/^stock master rejected: unreadable$/);
  });

  test("本番の build で検証に失敗すれば、固定の理由で build を失敗させる", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    place({ ...(syntheticRealSizedMaster() as object), schemaVersion: 2 });
    expect(() => configFor(PHASE_PRODUCTION_BUILD)).toThrow(
      /^stock master rejected: unsupported_version$/,
    );
  });

  test("本番の build で検証を通れば、設定を返し、ファイルを関数に含める", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    place(syntheticRealSizedMaster());
    const config = configFor(PHASE_PRODUCTION_BUILD);
    expect(config.outputFileTracingIncludes).toEqual({
      "/api/inspect": [`./${REAL_STOCK_MASTER_FILE}`],
    });
  });

  test.each(["preview", "development", ""])(
    "本番以外（VERCEL_ENV=%j）の build は、JSON が無くても通る",
    (value) => {
      vi.stubEnv("VERCEL_ENV", value);
      expect(() => configFor(PHASE_PRODUCTION_BUILD)).not.toThrow();
    },
  );

  test("build 以外の段階では、本番でも JSON を確かめない", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => configFor(PHASE_PRODUCTION_SERVER)).not.toThrow();
  });
});
