/**
 * The stock master JSON, its source Excel and real holdings CSV must not be in this public
 * repository (ADR 0002, docs/external-data-policy.md 4). `.gitignore` does not stop `git add -f`
 * or a different path, so this test lists the tracked files and fails on the kinds of files that
 * would carry them (#193). It looks only at file paths in the current tree, not at contents or
 * history; telling real data from synthetic data stays a rule for people.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Synthetic CSV files that may be tracked, as exact repository paths. Each entry needs a comment
 * with its reason, and the file must be synthetic (docs/design.md 3). Keep synthetic data inside
 * test code when possible; nothing is listed today. Stock master and Excel files cannot be listed.
 */
const ALLOWED_SYNTHETIC_CSV: ReadonlySet<string> = new Set<string>([]);

type Violation = { path: string; reason: "stock_master_dir" | "csv" | "excel" };

function findForbiddenPaths(
  paths: readonly string[],
  allowedCsv: ReadonlySet<string> = ALLOWED_SYNTHETIC_CSV,
): Violation[] {
  const violations: Violation[] = [];
  for (const path of paths) {
    const lower = path.toLowerCase();
    if (/(^|\/)data\/stock-master\//.test(lower)) {
      violations.push({ path, reason: "stock_master_dir" });
    } else if (/\.xlsx?$/.test(lower)) {
      violations.push({ path, reason: "excel" });
    } else if (lower.endsWith(".csv") && !allowedCsv.has(path)) {
      violations.push({ path, reason: "csv" });
    }
  }
  return violations;
}

function trackedPaths(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" });
  return output.split("\0").filter((path) => path !== "");
}

test("no tracked file is a stock master, an Excel file or an unlisted CSV", () => {
  const paths = trackedPaths();
  expect(paths).toContain("package.json");
  expect(findForbiddenPaths(paths)).toEqual([]);
});

test("every allowed synthetic CSV is still tracked", () => {
  const paths = new Set(trackedPaths());
  for (const path of ALLOWED_SYNTHETIC_CSV) {
    expect(paths, path).toContain(path);
  }
});

describe("findForbiddenPaths", () => {
  test.each([
    ["apps/web/data/stock-master/stock-master.json", "stock_master_dir"],
    ["data/stock-master/stock-master.json", "stock_master_dir"],
    ["packages/core/data/stock-master/nested/a.json", "stock_master_dir"],
    ["apps/web/Data/Stock-Master/stock-master.json", "stock_master_dir"],
    ["data/stock-master/listing.xlsx", "stock_master_dir"],
    ["holdings.csv", "csv"],
    ["apps/web/src/fixtures/holdings.CSV", "csv"],
    ["local/listing.xls", "excel"],
    ["docs/listing.xlsx", "excel"],
    ["docs/LISTING.XLSX", "excel"],
  ] as const)("rejects %s as %s", (path, reason) => {
    expect(findForbiddenPaths([path])).toEqual([{ path, reason }]);
  });

  test.each([
    "package.json",
    "apps/web/src/server/synthetic-stock-master.ts",
    "apps/web/scripts/fetch-stock-master.mjs",
    "docs/data/stock-master.md",
    "apps/web/mydata/stock-master/a.json",
    "docs/notes.csv.md",
    "docs/xlsx-notes.md",
  ])("accepts %s", (path) => {
    expect(findForbiddenPaths([path])).toEqual([]);
  });

  test("accepts a CSV only when its exact path is listed", () => {
    const allowed = new Set(["apps/web/src/fixtures/synthetic.csv"]);
    expect(findForbiddenPaths(["apps/web/src/fixtures/synthetic.csv"], allowed)).toEqual([]);
    expect(findForbiddenPaths(["apps/web/src/fixtures/Synthetic.csv"], allowed)).toEqual([
      { path: "apps/web/src/fixtures/Synthetic.csv", reason: "csv" },
    ]);
  });

  test("the allow list does not let Excel or stock master files through", () => {
    const paths = ["data/stock-master/a.csv", "docs/listing.xlsx"];
    expect(findForbiddenPaths(paths, new Set(paths))).toEqual([
      { path: "data/stock-master/a.csv", reason: "stock_master_dir" },
      { path: "docs/listing.xlsx", reason: "excel" },
    ]);
  });
});
