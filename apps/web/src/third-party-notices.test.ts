/**
 * The third-party notices (docs/design.md 6.7) are kept by hand (#73). These tests make the file
 * fail to match when Next.js or the bundled font is updated without reviewing it, instead of
 * relying on the README note alone. They read the real files and do not inspect the build output.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(resolve(WEB_ROOT, path), "utf8");
}

const notices = read("public/third-party-notices.txt");

test("the notices name the next version in apps/web/package.json", () => {
  const { dependencies } = JSON.parse(read("package.json")) as {
    dependencies: Record<string, string>;
  };
  const next = dependencies.next;
  expect(next).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  expect(notices).toContain(`- Next.js ${next} (MIT)`);
  expect(notices).toContain(`polyfill-nomodule of Next.js ${next}`);
});

test("the notices name the font package version written in the bundled font CSS", () => {
  const css = read("src/fonts/noto-sans-jp/noto-sans-jp.css");
  const version = /npm @fontsource\/noto-sans-jp ([0-9]+\.[0-9]+\.[0-9]+)/.exec(css)?.[1];
  expect(version).toBeDefined();
  expect(notices).toContain(`from @fontsource/noto-sans-jp ${version}`);
});

test("the notices carry every line of the bundled font license", () => {
  const lines = read("src/fonts/noto-sans-jp/OFL.txt")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");
  expect(lines.length).toBeGreaterThan(0);
  const noticeLines = new Set(notices.split("\n"));
  for (const line of lines) {
    expect(noticeLines, line).toContain(line);
  }
});

test("the notices are plain ASCII text", () => {
  for (const char of notices) {
    const code = char.charCodeAt(0);
    expect(
      code === 0x09 || code === 0x0a || (code >= 0x20 && code <= 0x7e),
      `U+${code.toString(16)}`,
    ).toBe(true);
  }
});
