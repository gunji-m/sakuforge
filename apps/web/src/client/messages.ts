/** Fixed texts the screen owns (docs/design.md 6.5). API messages are shown as received. */
export const MESSAGES = {
  noScript: "この画面を使うには、ブラウザで JavaScript を有効にしてください。",
  emptyHeading: "保有資産のCSVを選んでください",
  sending: "CSVを検査しています…",
  notComputable: "評価額の合計が 0 のため、構成を計算できません。",
  notFound: "ページが見つかりません",
  emptyGuide:
    "証券会社から書き出した国内株式（現物）の保有資産CSVを選ぶと、評価額の合計、年間配当見込み、業種の構成を表示します。CSVと結果はサーバーに保存しません。",
  csvCondition:
    "使えるのは、国内株式（現物）の保有資産を、証券会社の画面から既定の設定のまま書き出したCSVです（先頭に「銘柄」の見出しが7つ並ぶ形）。書き出す項目を変えたCSVや、形の違うCSVは取り込めないことがあります。",
  disclaimer: "SakuForge は投資助言を提供しません。計算結果の正確性・完全性は保証しません。",
  licenses: "ライセンス",
  storageNote: "結果はこのブラウザにだけ保存します。別の端末や別のブラウザでは表示されません。",
  fileName: "CSVファイル（.csv）を選んでください。",
  tooLarge: "CSVが大きすぎます。4 MiB以下のファイルを選んでください。",
  inspectionFailed: "今回のCSVは取り込めませんでした。次の点を直して、もう一度選んでください。",
  timeout: "時間内に処理できませんでした。時間をおいて再度お試しください。",
  network: "通信できませんでした。接続を確かめて、もう一度お試しください。",
  invalidResponse: "処理できませんでした。ページを再読み込みして、もう一度お試しください。",
  storageFailed:
    "結果をこのブラウザに保存できませんでした。表示している結果は、ページを閉じると消えます。",
  clearFailed: "保存した結果を消せませんでした。ブラウザの設定を確かめてください。",
  leftover: "このブラウザに、この版では表示できない保存分が残っています。",
  renderFailed: "表示できませんでした。ページを再読み込みしてください。",
  clearConfirm: "このブラウザに保存した結果をすべて消します。元に戻せません。",
} as const;

/** The line under a findings list when the API returned only part of the findings. */
export function omittedFindings(count: number): string {
  return `ほかに ${count} 件あります。`;
}

/** The line by the bar list when the shown result had stock codes the stock master did not know. */
export function unknownIncluded(count: number): string {
  return `未分類には、銘柄マスターに無い証券コードの銘柄（${count} 件）を含みます。`;
}
