/**
 * The Node version is written in three places: `.node-version` (read by CI), the Dev Container
 * image tag, and `engines.node` in the root and `apps/web` `package.json` (read by Vercel).
 * README asks to change them together; this test makes a mismatch fail instead of relying on
 * that note (#162). It reads the real files and does not check which Node runs the test.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}

function nodeVersion(): string {
  const version = read(".node-version").trim();
  expect(version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  return version;
}

test("the Dev Container image uses the exact version in .node-version", () => {
  const { image } = JSON.parse(read(".devcontainer/devcontainer.json")) as { image?: unknown };
  expect(typeof image).toBe("string");
  const tag = /^node:([0-9]+\.[0-9]+\.[0-9]+)-[a-z0-9.-]+@sha256:[0-9a-f]{64}$/.exec(String(image));
  expect(tag?.[1]).toBe(nodeVersion());
});

test.each(["package.json", "apps/web/package.json"])(
  "engines.node in %s is the major version of .node-version",
  (path) => {
    const { engines } = JSON.parse(read(path)) as { engines?: { node?: unknown } };
    const major = nodeVersion().split(".")[0];
    expect(engines?.node).toBe(`${major}.x`);
  },
);
