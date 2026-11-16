/**
 * The fixed texts users see are written in the documents, which are the source of truth
 * (AGENTS.md), and copied into code. These tests fail when a text in code is no longer in
 * its document word for word, so that the two cannot drift apart unnoticed (#140).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FINDING_MESSAGES } from "@sakuforge/core";
import { describe, expect, test } from "vitest";
import { MESSAGES, omittedFindings } from "../client/messages";
import { TSE_STOCK_MASTER_SOURCE } from "./current-stock-master";
import { ERRORS } from "./errors";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function doc(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}

describe("所見の message は、ドメイン規則 6 節の表にそのまま書かれている", () => {
  const rules = doc("docs/domain-rules.md");
  test.each(Object.entries(FINDING_MESSAGES))("%s", (_code, message) => {
    expect(rules).toContain(message);
  });
});

describe("検査へ進めなかったときの message は、設計 8.3 の表にそのまま書かれている", () => {
  const design = doc("docs/design.md");
  test.each(Object.entries(ERRORS))("%s", (code, { message }) => {
    expect(design).toContain(`| \`${code}\` |`);
    expect(design).toContain(message);
  });
});

describe("画面が持つ固定の文言は、設計 6.5 の表にそのまま書かれている", () => {
  const design = doc("docs/design.md");
  test.each(Object.entries(MESSAGES))("%s", (_name, text) => {
    expect(design).toContain(text);
  });

  test("所見の省略の文は、件数を N とした形で書かれている", () => {
    expect(design).toContain(omittedFindings(0).replace("0", "N"));
  });
});

test("東証の出典の表記は、外部データとの約束 3 節と設計 8.2 にそのまま書かれている", () => {
  expect(doc("docs/external-data-policy.md")).toContain(TSE_STOCK_MASTER_SOURCE);
  expect(doc("docs/design.md")).toContain(TSE_STOCK_MASTER_SOURCE);
});
