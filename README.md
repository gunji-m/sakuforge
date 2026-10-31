# sakuforge

開発者以外の少数の利用者に、招待で使ってもらう。品質と安全を優先し、公開しても問題を起こさない
サービスにする。宣伝はしない。開発者自身が内部を理解できる大きさに保つ。利用者データを預からない
（CSV を受け取って検査・集計の結果を返すだけで、保存しない）。

- 状態: 準備中。言語は未決（[ADR 0001](docs/decisions/0001-declaration-and-origin.md) の後、ADR 0003 以降で決める）
- 出自: 出自は gunji-m/tfdata-api の main `4a25bc93e8dba5b8bce866d6707bce6415ec61da`。判断の履歴はそちら。
- LICENSE: 未決（本人が選ぶ）
- 進行 Issue: 作成後に追記

## 文書

| 文書 | 中身 |
| --- | --- |
| [docs/decisions/](docs/decisions/) | 判断の記録（ADR） |
| [docs/domain-rules.md](docs/domain-rules.md) | 保有 CSV、検査所見、構成計算の規則 |
| [docs/input-trust-principles.md](docs/input-trust-principles.md) | 入力を信用しない原則 |
| [docs/external-data-policy.md](docs/external-data-policy.md) | 外部データ（東証の銘柄一覧）との約束 |
| [docs/git-workflow.md](docs/git-workflow.md) | branch、PR、merge の規則 |
| [AGENTS.md](AGENTS.md) | agent 向けの作業規則 |
| [SECURITY.md](SECURITY.md) | 脆弱性の連絡方法 |
