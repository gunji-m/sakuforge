/**
 * The screen's code is shipped to the browser. It must not reach the server side
 * (`src/server/`, `app/api/`) or the core (`@sakuforge/core`), so that the stock master
 * and the inspection code never leave the server function (docs/design.md section 2).
 * This test follows the screen's imports and fails when one of them gets there.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type ReadSource = (path: string) => string | null;

/** Module specifiers of static imports, re-exports, side-effect imports and dynamic imports. */
export function importSpecifiers(source: string): string[] {
  const patterns = [
    /^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

function isForbidden(specifier: string, resolved: string | null): boolean {
  if (specifier === "@sakuforge/core" || specifier.startsWith("@sakuforge/core/")) return true;
  if (resolved === null) return false;
  const path = relative(WEB_ROOT, resolved).split("\\").join("/");
  return path.startsWith("src/server/") || path.startsWith("app/api/");
}

function resolveRelative(from: string, specifier: string, read: ReadSource): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (/\.tsx?$/.test(candidate) && read(candidate) !== null) return candidate;
  }
  // A path that is not a TypeScript file (for example a stylesheet) is still checked by place.
  return base;
}

/** Follows relative imports from the entries and lists every forbidden import reached. */
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
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveRelative(file, specifier, read);
      if (isForbidden(specifier, resolved)) {
        found.push(`${relative(WEB_ROOT, file)} -> ${specifier}`);
      } else if (resolved !== null) {
        queue.push(resolved);
      }
    }
  }
  return found;
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
      /^\s*["']use client["']/.test(readFileSync(path, "utf8").replace(/^\s*\/\/.*\n/gm, "")),
  );
  return [...client, ...app];
}

test("画面側のコードは、サーバー側と核を読み込まない", () => {
  const entries = screenEntries();
  // The check is meaningful only if it actually found the screen's files.
  expect(entries.some((path) => path.endsWith("dashboard.tsx"))).toBe(true);
  expect(entries.some((path) => path.endsWith("global-error.tsx"))).toBe(true);
  expect(forbiddenImports(entries, readFromDisk)).toEqual([]);
});

test("検査の仕組みは、直接・間接に読み込まれたサーバー側と核を見つける", () => {
  const files: Record<string, string> = {
    [join(WEB_ROOT, "src/client/ok.ts")]: 'import { MESSAGES } from "./messages";\n',
    [join(WEB_ROOT, "src/client/messages.ts")]: "export const MESSAGES = {};\n",
    [join(WEB_ROOT, "src/client/core.ts")]:
      'import {\n  checkStockCode,\n} from "@sakuforge/core";\n',
    [join(WEB_ROOT, "src/client/server.ts")]: 'export { ERRORS } from "../server/errors";\n',
    [join(WEB_ROOT, "src/client/indirect.tsx")]: 'import "./helper";\n',
    [join(WEB_ROOT, "src/client/helper.ts")]:
      'const load = () => import("../../app/api/inspect/route");\n',
    [join(WEB_ROOT, "src/server/errors.ts")]: "export const ERRORS = {};\n",
  };
  const read: ReadSource = (path) => files[path] ?? null;
  const at = (name: string) => [join(WEB_ROOT, "src/client", name)];

  expect(forbiddenImports(at("ok.ts"), read)).toEqual([]);
  expect(forbiddenImports(at("core.ts"), read)).toEqual(["src/client/core.ts -> @sakuforge/core"]);
  expect(forbiddenImports(at("server.ts"), read)).toEqual([
    "src/client/server.ts -> ../server/errors",
  ]);
  expect(forbiddenImports(at("indirect.tsx"), read)).toEqual([
    "src/client/helper.ts -> ../../app/api/inspect/route",
  ]);
});

test("コメントの中の import は数えない", () => {
  expect(importSpecifiers('// import x from "@sakuforge/core";\nconst a = 1;\n')).toEqual([]);
});
