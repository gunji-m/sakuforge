/**
 * The screen's code is shipped to the browser. It must not reach the server side
 * (`src/server/`, `app/api/`) or the core (`packages/core`, `@sakuforge/core`), so that
 * the stock master and the inspection code never leave the server function
 * (docs/design.md section 2).
 *
 * This check fails closed. It does not parse the code: it reads every quoted relative path
 * in a screen file, wherever it appears, and follows the ones that lead to a file. A screen
 * file that merely mentions a forbidden place, even in a comment or a string, also fails.
 * Such a false alarm is cheap to fix by rewording; a missed import would silently ship the
 * stock master to the browser.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(WEB_ROOT, "../..");

type ReadSource = (path: string) => string | null;

/** Text that a screen file must not contain anywhere, because it names a forbidden place. */
const FORBIDDEN_TEXT = ["@sakuforge/core", "packages/core", "src/server", "app/api", "/server/"];

/**
 * Every quoted relative path in the text, with any quote character, wherever it appears
 * (code, comments, strings, template literals, nested interpolations).
 */
export function quotedRelativePaths(source: string): string[] {
  return [...source.matchAll(/["'`](\.{1,2}\/[^"'`\s$]*)["'`$]/g)].map((match) => match[1] ?? "");
}

/** Whether the text contains the `"use client"` directive anywhere (fails closed). */
export function mentionsUseClient(source: string): boolean {
  return /["'`]use client["'`]/.test(source);
}

function placeOf(path: string): { web: string; repo: string } {
  return {
    web: relative(WEB_ROOT, path).split("\\").join("/"),
    repo: relative(REPO_ROOT, path).split("\\").join("/"),
  };
}

function isForbiddenPlace(path: string): boolean {
  const { web, repo } = placeOf(path);
  return (
    web.startsWith("src/server/") ||
    web.startsWith("app/api/") ||
    repo === "packages/core" ||
    repo.startsWith("packages/core/")
  );
}

function resolveRelative(from: string, specifier: string, read: ReadSource): string {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (/\.tsx?$/.test(candidate) && read(candidate) !== null) return candidate;
  }
  // A path that is not a TypeScript file (for example a stylesheet) is still checked by place.
  return base;
}

/** Follows relative paths from the entries and lists every forbidden reference reached. */
export function forbiddenImports(entries: readonly string[], read: ReadSource): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  const found: string[] = [];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const source = read(file);
    if (source === null) continue;
    const name = placeOf(file).web;
    for (const text of FORBIDDEN_TEXT) {
      if (source.includes(text)) found.push(`${name} -> ${text}`);
    }
    for (const specifier of quotedRelativePaths(source)) {
      const resolved = resolveRelative(file, specifier, read);
      if (isForbiddenPlace(resolved)) {
        found.push(`${name} -> ${specifier}`);
      } else {
        queue.push(resolved);
      }
    }
  }
  return [...new Set(found)];
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function readFromDisk(path: string): string | null {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : null;
}

/** Files that run in the browser: everything in `src/client/`, and `"use client"` files in `app/`. */
function screenEntries(): string[] {
  const client = filesUnder(join(WEB_ROOT, "src", "client")).filter(
    (path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path),
  );
  const app = filesUnder(join(WEB_ROOT, "app")).filter(
    (path) =>
      /\.tsx?$/.test(path) &&
      !placeOf(path).web.startsWith("app/api/") &&
      mentionsUseClient(readFileSync(path, "utf8")),
  );
  return [...client, ...app];
}

test("画面側のコードは、サーバー側と core を読み込まない", () => {
  const entries = screenEntries();
  // The check is meaningful only if it actually found the screen's files.
  expect(entries.some((path) => path.endsWith("dashboard.tsx"))).toBe(true);
  expect(entries.some((path) => path.endsWith("global-error.tsx"))).toBe(true);
  expect(forbiddenImports(entries, readFromDisk)).toEqual([]);
});

/** Runs the check on synthetic files, keyed by their path under `apps/web/`. */
function check(entry: string, files: Record<string, string>): string[] {
  const byPath = new Map(Object.entries(files).map(([path, text]) => [join(WEB_ROOT, path), text]));
  return forbiddenImports([join(WEB_ROOT, entry)], (path) => byPath.get(path) ?? null);
}

test("画面側だけを読み込むなら通る", () => {
  expect(
    check("src/client/ok.ts", {
      "src/client/ok.ts": 'import { MESSAGES } from "./messages";\n',
      "src/client/messages.ts": "export const MESSAGES = {};\n",
    }),
  ).toEqual([]);
});

test("core とサーバー側の読み込みを、書き方によらず見つける", () => {
  const cases: [string, string][] = [
    ['import {\n  checkStockCode,\n} from "@sakuforge/core";\n', "@sakuforge/core"],
    ['export { ERRORS } from "../server/errors";\n', "../server/errors"],
    ['import "../server/errors";\n', "../server/errors"],
    ['const load = () => import("../server/errors");\n', "../server/errors"],
    ["const load = () => import(`../server/errors`);\n", "../server/errors"],
    ['const quote = /\'/;\nconst load = () => import("../server/errors");\n', "../server/errors"],
    [
      // A template literal whose interpolation imports; "@{" stands for "$" + "{".
      'const label = async () => `master: @{await import("../server/errors")}`;\n'.replace(
        "@{",
        `${"$"}{`,
      ),
      "../server/errors",
    ],
    ['import { x } from "../../../packages/core/src/index";\n', "packages/core"],
  ];
  for (const [source, expected] of cases) {
    const found = check("src/client/entry.ts", {
      "src/client/entry.ts": source,
      "src/server/errors.ts": "export const ERRORS = {};\n",
    });
    expect(
      found.some((line) => line.includes(expected)),
      source,
    ).toBe(true);
  }
});

test("間接の読み込み（ディレクトリの index.tsx を含む）も辿る", () => {
  expect(
    check("src/client/example.ts", {
      "src/client/example.ts": 'import { View } from "../shared/view";\n',
      "src/shared/view/index.tsx": 'import "./helper";\n',
      "src/shared/view/helper.ts": 'const load = () => import("../../../app/api/inspect/route");\n',
    }),
  ).toEqual([
    "src/shared/view/helper.ts -> app/api",
    "src/shared/view/helper.ts -> ../../../app/api/inspect/route",
  ]);
});

test("禁止先を指す文字は、コメントの中でも違反にする（見逃さないことを優先する）", () => {
  expect(
    check("src/client/note.ts", {
      "src/client/note.ts": "// This file must not import @sakuforge/core.\nexport {};\n",
    }),
  ).toEqual(["src/client/note.ts -> @sakuforge/core"]);
});

test("use client は、先頭のコメントの後にあっても入口として数える", () => {
  expect(mentionsUseClient('"use client";\nexport {};')).toBe(true);
  expect(mentionsUseClient('/**\n * Header.\n */\n"use client";\n')).toBe(true);
  expect(mentionsUseClient("export const a = 1;\n")).toBe(false);
});
