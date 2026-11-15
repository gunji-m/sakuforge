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

/**
 * Blanks out comments and the contents of string literals, keeping every offset, so that
 * text in comments and strings is never read as code. Quote characters stay in place.
 */
export function maskSource(source: string): string {
  const out = source.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (char === '"' || char === "'" || char === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== char) j += source[j] === "\\" ? 2 : 1;
      blank(i + 1, Math.min(j, source.length));
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join("");
}

/** Module specifiers of static imports, re-exports, side-effect imports and dynamic imports. */
export function importSpecifiers(source: string): string[] {
  const masked = maskSource(source);
  // Each pattern ends at the opening quote of the specifier; the literal is read from the source.
  const patterns = [
    /(?:^|[;}\s])(?:import|export)\b[^;"'`]*?\bfrom\s*(["'])/g,
    /(?:^|[;}\s])import\s*(["'])/g,
    /\bimport\s*\(\s*(["'])/g,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of masked.matchAll(pattern)) {
      const quote = match[1] ?? '"';
      const start = (match.index ?? 0) + match[0].length;
      const end = source.indexOf(quote, start);
      if (end > start) found.push(source.slice(start, end));
    }
  }
  return found;
}

/** Whether the file's first statement is the `"use client"` directive, after any comments. */
export function isClientDirective(source: string): boolean {
  const masked = maskSource(source);
  const start = masked.search(/\S/);
  if (start === -1) return false;
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return false;
  return source.slice(start + 1, source.indexOf(quote, start + 1)) === "use client";
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
    (path) => /\.tsx?$/.test(path) && isClientDirective(readFileSync(path, "utf8")),
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

test("コメントと文字列の中の import は数えない", () => {
  const source = [
    '// import x from "@sakuforge/core";',
    '// import("@sakuforge/core") is forbidden here.',
    '/* import { y } from "../server/errors"; */',
    "const text = \"import('@sakuforge/core')\";",
    'const other = `import "../server/errors"`;',
    'import { MESSAGES } from "./messages";',
  ].join("\n");
  expect(importSpecifiers(source)).toEqual(["./messages"]);
});

test("複数行の import、副作用の import、動的 import を読み取る", () => {
  const source = [
    "import {",
    "  a,",
    "  b,",
    '} from "./multi";',
    'import "./side-effect";',
    'export * from "./reexport";',
    'const lazy = () => import("./lazy");',
  ].join("\n");
  expect(importSpecifiers(source).sort()).toEqual(
    ["./lazy", "./multi", "./reexport", "./side-effect"].sort(),
  );
});

test("先頭のコメントの後にある use client を見つける", () => {
  expect(isClientDirective('"use client";\nexport {};')).toBe(true);
  expect(isClientDirective("// note\n'use client';\n")).toBe(true);
  expect(isClientDirective('/**\n * Header.\n */\n"use client";\n')).toBe(true);
  expect(isClientDirective('import x from "./x";\n"use client";\n')).toBe(false);
  expect(isClientDirective('/* "use client" */\nexport {};')).toBe(false);
});

test("ディレクトリの index.tsx を経由した読み込みも辿る", () => {
  const files: Record<string, string> = {
    [join(WEB_ROOT, "src/client/example.ts")]: 'import { View } from "../shared/view";\n',
    [join(WEB_ROOT, "src/shared/view/index.tsx")]:
      'import { loadCurrentStockMaster } from "../../server/current-stock-master";\n',
  };
  expect(
    forbiddenImports([join(WEB_ROOT, "src/client/example.ts")], (path) => files[path] ?? null),
  ).toEqual(["src/shared/view/index.tsx -> ../../server/current-stock-master"]);
});
