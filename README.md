# sakuforge

開発者以外の少数の利用者に、招待で使ってもらう。品質と安全を優先し、公開しても問題を起こさない
サービスにする。宣伝はしない。開発者自身が内部を理解できる大きさに保つ。利用者データを預からない
（CSV を受け取って検査・集計の結果を返すだけで、保存しない）。

- 状態: 準備中。言語は TypeScript（[ADR 0003](docs/decisions/0003-language-typescript.md)）。配置は Vercel と Next.js で、CSV の検査と集計はサーバー関数で行い結果を JSON で返す（[ADR 0004](docs/decisions/0004-vercel-nextjs-server-side.md)）
- 出自: 出自は gunji-m/tfdata-api の main `4a25bc93e8dba5b8bce866d6707bce6415ec61da`。判断の履歴はそちら。
- 進行 Issue: [#1 sakuforge 立ち上げの進行と再開入口](https://github.com/gunji-m/sakuforge/issues/1)

## 文書

| 文書 | 中身 |
| --- | --- |
| [docs/decisions/](docs/decisions/) | 判断の記録（ADR） |
| [docs/domain-rules.md](docs/domain-rules.md) | 保有 CSV、検査所見、構成計算の規則 |
| [docs/design.md](docs/design.md) | 純粋関数の境界、パッケージ構成、銘柄マスターの流れ |
| [docs/input-trust-principles.md](docs/input-trust-principles.md) | 入力を信用しない原則 |
| [docs/external-data-policy.md](docs/external-data-policy.md) | 外部データ（東証の銘柄一覧）との約束 |
| [docs/git-workflow.md](docs/git-workflow.md) | branch、PR、merge の規則 |
| [AGENTS.md](AGENTS.md) | agent 向けの作業規則 |
| [SECURITY.md](SECURITY.md) | 脆弱性の連絡方法 |

## ライセンスと免責

コードは [MIT License](LICENSE) で公開しています。ライセンスはコードに適用されるもので、SakuForge の名称・ロゴ・ドメイン `sakuforge.fyi` の使用を許諾するものではありません。

SakuForge は投資助言を提供しません。構成比や配当見込みなどの計算結果の正確性・完全性は保証せず、投資判断は利用者自身の責任で行ってください。
