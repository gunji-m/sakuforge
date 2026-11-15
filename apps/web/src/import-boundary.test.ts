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
const REPO_ROOT = resolve(WEB_ROOT, "../..");

type ReadSource = (path: string) => string | null;

/**
 * Blanks out comments and the text of string literals, keeping every offset, so that text
 * in comments and strings is never read as code. Quote characters stay in place, and the
 * `${...}` expressions inside template literals are scanned as code.
 */
export function maskSource(source: string): string {
  const out = source.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };

  // Scans code from `start`. Inside a `${...}` it stops after the closing brace.
  function code(start: number, insideTemplate: boolean): number {
    let i = start;
    let depth = 0;
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
      } else if (char === '"' || char === "'") {
        let j = i + 1;
        while (j < source.length && source[j] !== char) j += source[j] === "\\" ? 2 : 1;
        blank(i + 1, Math.min(j, source.length));
        i = j + 1;
      } else if (char === "`") {
        i = template(i + 1);
      } else if (char === "{") {
        depth += 1;
        i += 1;
      } else if (char === "}") {
        if (insideTemplate && depth === 0) return i + 1;
        depth -= 1;
        i += 1;
      } else {
        i += 1;
      }
    }
    return i;
  }

  // Scans a template literal from just after its opening backtick.
  function template(start: number): number {
    let i = start;
    while (i < source.length) {
      const char = source[i];
      if (char === "\\") {
        blank(i, i + 2);
        i += 2;
      } else if (char === "`") {
        return i + 1;
      } else if (char === "$" && source[i + 1] === "{") {
        i = code(i + 2, true);
      } else {
        blank(i, i + 1);
        i += 1;
      }
    }
    return i;
  }

  code(0, false);
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
  const fromRepo = relative(REPO_ROOT, resolved).split("\\").join("/");
  return (
    path.startsWith("src/server/") ||
    path.startsWith("app/api/") ||
    fromRepo === "packages/core" ||
    fromRepo.startsWith("packages/core/")
  );
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

test("テンプレート文字列の補間式の中の動的 import も読み取る", () => {
  // The input is source text with template literals. "@{" stands for the "$" + "{" that opens
  // an interpolation, so that this file itself contains no placeholder-like strings.
  const source = [
    'const label = async () => `master: @{await import("../server/current-stock-master")}`;',
    'const nested = `a @{`b @{import("./inner")}`} c`;',
    'const text = `import("@sakuforge/core") is only text`;',
  ]
    .join("\n")
    .replaceAll("@{", `${"$"}{`);
  expect(source).toContain(`${"$"}{await import(`);
  expect(importSpecifiers(source).sort()).toEqual(
    ["../server/current-stock-master", "./inner"].sort(),
  );
});

test("相対パスで読み込んだ core も見つける", () => {
  const entry = join(WEB_ROOT, "src/client/example.ts");
  const files: Record<string, string> = {
    [entry]:
      'import { inspectAndAggregateHoldingsCsv } from "../../../../packages/core/src/index";\n',
    [join(REPO_ROOT, "packages/core/src/index.ts")]: "export {};\n",
  };
  expect(forbiddenImports([entry], (path) => files[path] ?? null)).toEqual([
    "src/client/example.ts -> ../../../../packages/core/src/index",
  ]);
});
