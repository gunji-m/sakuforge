# sakuforge

開発者以外の少数の利用者に、招待で使ってもらう。品質と安全を優先し、公開しても問題を起こさない
サービスにする。宣伝はしない。開発者自身が内部を理解できる大きさに保つ。利用者データを預からない
（CSV を受け取って検査・集計の結果を返すだけで、保存しない）。

- 状態: 準備中。言語は TypeScript（[ADR 0003](docs/decisions/0003-language-typescript.md)）。配置は Vercel と Next.js で、CSV の検査と集計はサーバー関数で行い結果を JSON で返す（[ADR 0004](docs/decisions/0004-vercel-nextjs-server-side.md)）。最初の招待で提供する範囲は [ADR 0005](docs/decisions/0005-first-invitation-scope.md)
- 出自: 出自は tfdata-api の main `4a25bc93e8dba5b8bce866d6707bce6415ec61da`。判断の履歴はそちら。
- 全体の入口: #45 sakuforge の段階と進め方

## 開発環境（Dev Container）

[.devcontainer/devcontainer.json](.devcontainer/devcontainer.json) で、手元に Node や pnpm を入れずに、`.node-version` と同じ Node と lockfile どおりの依存で動かせる。Vercel の実行環境を再現するものではない。

1. VS Code の Dev Containers 拡張などで、リポジトリをコンテナで開く。作成時に `corepack pnpm install --frozen-lockfile` が走る
2. コンテナの中で `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する

`node_modules` はコンテナ専用の volume に置くので、手元の `node_modules` とは混ざらない。Next.js の開発サーバーの port 3000 は手元へ転送し、Next.js の匿名テレメトリーは止めてある（`NEXT_TELEMETRY_DISABLED=1`）。Node の版を上げるときは、`.node-version` とイメージのタグ・digest を一緒に直す。

## 文書

| 文書 | 中身 |
| --- | --- |
| [docs/decisions/](docs/decisions/) | 判断の記録（ADR） |
| [docs/domain-rules.md](docs/domain-rules.md) | 保有 CSV、検査所見、構成計算の規則 |
| [docs/design.md](docs/design.md) | 純粋関数の境界、パッケージ構成、銘柄マスターの流れ |
| [docs/input-trust-principles.md](docs/input-trust-principles.md) | 入力を信用しない原則 |
| [docs/external-data-policy.md](docs/external-data-policy.md) | 外部データ（東証の銘柄一覧）との約束 |
| [docs/git-workflow.md](docs/git-workflow.md) | branch、PR、merge の規則 |
| [docs/layer-operations.md](docs/layer-operations.md) | α層・β層が読む Issue運用と開発体制の手続き |
| [AGENTS.md](AGENTS.md) | agent 向けの作業規則 |
| [SECURITY.md](SECURITY.md) | 脆弱性の連絡方法 |

## ライセンスと免責

コードは [MIT License](LICENSE) で公開しています。ライセンスはコードに適用されるもので、SakuForge の名称・ロゴ・ドメイン `sakuforge.fyi` の使用を許諾するものではありません。

SakuForge は投資助言を提供しません。構成比や配当見込みなどの計算結果の正確性・完全性は保証せず、投資判断は利用者自身の責任で行ってください。
