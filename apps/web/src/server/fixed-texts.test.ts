/**
 * The fixed texts users see are written in the documents, which are the source of truth
 * (AGENTS.md), and copied into code. These tests read the documents' tables and compare each
 * text in code with its own row, word for word, so that a changed, shortened or swapped text
 * fails (#140).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FINDING_MESSAGES } from "@sakuforge/core";
import { expect, test } from "vitest";
import { MESSAGES, omittedFindings, unknownIncluded } from "../client/messages";
import { TSE_STOCK_MASTER_SOURCE } from "./current-stock-master";
import { ERRORS } from "./errors";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function doc(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), "utf8");
}

/** The body rows of the Markdown table whose header line is `header`, as trimmed cells. */
export function tableRows(text: string, header: string): string[][] {
  const lines = text.split("\n");
  const start = lines.indexOf(header);
  if (start === -1) throw new Error(`table not found: ${header}`);
  const rows: string[][] = [];
  // Skip the header and the separator line; the table ends at the first line that is not a row.
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

/** `code` cell (in backticks) to the last cell of its row. */
function messagesByCode(rows: readonly string[][]): Record<string, string> {
  return Object.fromEntries(
    rows.map((cells) => [(cells[0] ?? "").replace(/^`|`$/g, ""), cells.at(-1) ?? ""]),
  );
}

test("所見の message は、ドメイン規則 6 節の表の同じ code の行と完全に一致する", () => {
  const rows = tableRows(doc("docs/domain-rules.md"), "| code | 位置 | 意味 | 固定 message |");
  expect(messagesByCode(rows)).toEqual({ ...FINDING_MESSAGES });
});

test("検査へ進めなかったときの message は、設計 8.3 の表の同じ code の行と完全に一致する", () => {
  const rows = tableRows(doc("docs/design.md"), "| code | HTTP | 意味 | message |");
  const fromCode = Object.fromEntries(
    Object.entries(ERRORS).map(([code, { message }]) => [code, message]),
  );
  expect(messagesByCode(rows)).toEqual(fromCode);
  const statusByCode = Object.fromEntries(rows.map((cells) => [cells[0]?.slice(1, -1), cells[1]]));
  for (const [code, { status }] of Object.entries(ERRORS)) {
    expect(statusByCode[code]).toBe(String(status));
  }
});

test("画面が持つ固定の文言は、それぞれ設計 6.5 の表のどれかの行の文言と完全に一致する", () => {
  const texts = tableRows(doc("docs/design.md"), "| 場面 | 文言 |").map((cells) => cells[1]);
  for (const [name, text] of Object.entries(MESSAGES)) {
    expect(texts, name).toContain(text);
  }
  // The omitted-findings line carries a count, written as N in the table.
  expect(texts).toContain(omittedFindings(0).replace("0", "N"));
  expect(texts).toContain(unknownIncluded(0).replace("0", "N"));
});

test("表の読み取りは、行の文言を縮めたり取り違えたりしたものを一致としない", () => {
  const table = ["| code | 意味 | message |", "| --- | --- | --- |", "| `a` | x | 文言A。 |", ""];
  const rows = tableRows(table.join("\n"), "| code | 意味 | message |");
  expect(messagesByCode(rows)).toEqual({ a: "文言A。" });
  expect(messagesByCode(rows)).not.toEqual({ a: "文言A" });
});

test("東証の出典の表記は、外部データとの約束 3 節と設計 8.2 にそのまま書かれている", () => {
  expect(doc("docs/external-data-policy.md")).toContain(TSE_STOCK_MASTER_SOURCE);
  expect(doc("docs/design.md")).toContain(TSE_STOCK_MASTER_SOURCE);
});
