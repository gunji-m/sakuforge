"use client";

import { type ChangeEvent, useEffect, useId, useReducer, useRef } from "react";
import type { Finding } from "./api-response";
import { formatYen } from "./format";
import { MESSAGES } from "./messages";
import { precheckFile } from "./precheck";
import {
  INITIAL_STATE,
  type Notice,
  reduce,
  type ShownResult,
  toStoredResult,
} from "./screen-state";
import { SectorCharts } from "./sector-charts";
import { clearResults, loadLatestResult, saveResult } from "./storage";
import { submitCsv } from "./submit";

function formatAsOf(asOf: string): string {
  const [year = "", month = ""] = asOf.split("-");
  return `${year}年${Number(month)}月末時点`;
}

function formatSavedAt(savedAt: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(savedAt),
  );
}

function Yen({ amount }: { readonly amount: string }) {
  return (
    <>
      {formatYen(amount) ?? "—"}
      <span className="figure-unit">円</span>
    </>
  );
}

function FindingsList({ findings }: { readonly findings: readonly Finding[] }) {
  // One line per code: the fixed message, then the rows it applies to.
  const groups = new Map<string, { message: string; rows: number[] }>();
  for (const { code, message, row } of findings) {
    const group = groups.get(code) ?? { message, rows: [] };
    if (row !== undefined && !group.rows.includes(row)) group.rows.push(row);
    groups.set(code, group);
  }
  return (
    <ul className="notice-list">
      {[...groups].map(([code, { message, rows }]) => (
        <li key={code}>
          {message}
          {rows.length > 0 && <span className="notice-rows">（{rows.join("、")} 行目）</span>}
        </li>
      ))}
    </ul>
  );
}

function NoticeBand({
  notice,
  onClose,
}: {
  readonly notice: Notice;
  readonly onClose: () => void;
}) {
  return (
    <section className="notice" role={notice.kind === "unknown_codes" ? "status" : "alert"}>
      <div className="notice-body">
        {notice.kind === "message" && <p className="notice-title">{notice.text}</p>}
        {notice.kind === "inspection_failed" && (
          <>
            <p className="notice-title">{MESSAGES.inspectionFailed}</p>
            <FindingsList findings={notice.findings} />
            {notice.omitted > 0 && (
              <p className="notice-rows">ほかに {notice.omitted} 件あります。</p>
            )}
            {notice.stockMaster !== null && (
              <p className="notice-rows">
                出典：{notice.stockMaster.source}（{formatAsOf(notice.stockMaster.asOf)}）
              </p>
            )}
          </>
        )}
        {notice.kind === "unknown_codes" && (
          <>
            <p className="notice-title">{notice.text}</p>
            <details>
              <summary>該当する証券コード（{notice.codes.length} 件）</summary>
              <p className="notice-codes">{notice.codes.join("、")}</p>
            </details>
          </>
        )}
      </div>
      <button type="button" className="notice-close" aria-label="閉じる" onClick={onClose}>
        ×
      </button>
    </section>
  );
}

function Figures({ result }: { readonly result: ShownResult }) {
  const { totalAssetValue, annualDividend } = result.aggregation;
  const sameDividend = annualDividend.lower === annualDividend.upper;
  return (
    <section className="figures" aria-label="集計結果">
      <div className="card">
        <h2>評価額の合計</h2>
        <p className="figure-value">
          <Yen amount={totalAssetValue} />
        </p>
        <p className="figure-note">保有株数 × 現在値の合計（{result.rowsScanned} 行）</p>
      </div>
      <div className="card">
        <h2>年間配当見込み（税引前）</h2>
        <p className="figure-value">
          <Yen amount={annualDividend.lower} />
          {!sameDividend && (
            <>
              {" 〜 "}
              <Yen amount={annualDividend.upper} />
            </>
          )}
        </p>
        <p className="figure-note">保有株数 × 予想1株配当の合計</p>
      </div>
    </section>
  );
}

export function Dashboard() {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const inputId = useId();
  const sendingRef = useRef(false);

  // Stored results exist only in the browser, so they are read after the first render.
  useEffect(() => {
    dispatch({ type: "restored", stored: loadLatestResult(window.localStorage) });
  }, []);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Allow choosing the same file again after fixing it.
    input.value = "";
    if (file === undefined || sendingRef.current) return;
    const check = precheckFile(file.name, file.size);
    if (check !== "ok") {
      const text = check === "file_name" ? MESSAGES.fileName : MESSAGES.tooLarge;
      dispatch({ type: "stopped", text });
      return;
    }
    sendingRef.current = true;
    dispatch({ type: "started" });
    try {
      const outcome = await submitCsv(file, (url, init) => fetch(url, init));
      if (outcome.kind === "response" && outcome.response.result === "aggregated") {
        const entry = toStoredResult(outcome.response, new Date().toISOString());
        const ok = saveResult(window.localStorage, entry);
        dispatch({ type: "finished", outcome, saved: { entry, ok } });
      } else {
        dispatch({ type: "finished", outcome });
      }
    } finally {
      sendingRef.current = false;
    }
  }

  function onClear() {
    if (!window.confirm(MESSAGES.clearConfirm)) return;
    dispatch({ type: "cleared", ok: clearResults(window.localStorage) });
  }

  const { loaded, result, sending, notices } = state;
  const chooser = (
    <>
      <input
        id={inputId}
        className="file-input"
        type="file"
        accept=".csv,text/csv"
        disabled={sending}
        onChange={onFileChange}
      />
      <label htmlFor={inputId} className="button button-primary" aria-disabled={sending}>
        {result === null ? "CSV を選ぶ" : "CSV を取り込む"}
      </label>
    </>
  );

  return (
    <div className="page">
      <header className="header">
        <div className="header-title">
          <h1 className="brand">sakuforge</h1>
          {result !== null && (
            <span className="meta">
              {formatSavedAt(result.savedAt)} 取り込み ・ 出典：{result.stockMaster.source}（
              {formatAsOf(result.stockMaster.asOf)}）
            </span>
          )}
        </div>
        {result !== null && (
          <div className="actions">
            <button type="button" className="button" disabled={sending} onClick={onClear}>
              保存した結果を消す
            </button>
            {chooser}
          </div>
        )}
      </header>
      <main className="main">
        {sending && (
          <p className="sending" role="status">
            CSVを検査しています…
          </p>
        )}
        {notices.map((notice, index) => (
          <NoticeBand
            // biome-ignore lint/suspicious/noArrayIndexKey: notices have no identity beyond their position
            key={index}
            notice={notice}
            onClose={() => dispatch({ type: "notice_closed", index })}
          />
        ))}
        {loaded && result === null && (
          <section className="card empty">
            <h2>保有資産のCSVを選んでください</h2>
            <p>{MESSAGES.emptyGuide}</p>
            <p className="figure-note">{MESSAGES.storageNote}</p>
            {chooser}
          </section>
        )}
        {result !== null && (
          <>
            <Figures result={result} />
            <SectorCharts aggregation={result.aggregation} />
          </>
        )}
      </main>
      <footer className="footer">
        {result !== null && <p>{MESSAGES.storageNote}</p>}
        <p>SakuForge は投資助言を提供しません。計算結果の正確性・完全性は保証しません。</p>
      </footer>
    </div>
  );
}
