# Git workflow

この文書は、sakuforge の branch、Pull Request（PR）、merge の正本です。内容が異なる場合はこの文書を
優先します。出自は gunji-m/tfdata-api の同名文書（main `4a25bc93e8dba5b8bce866d6707bce6415ec61da`）で、
配備と VPS の部分を除いて書き直しています。

## 基本方針

- `main`を唯一のmainlineとする
- 通常の変更は、最新の`main`から作成したIssue単位のshort-lived branchで行う
- PR、CI、self-reviewを通過した変更だけを`main`へMerge commitで統合する
- `main`へ通常の直接commit／pushを行わず、force pushやbranch削除も行わない
- `develop`、常設`release/*`、GitFlowは導入しない

リポジトリを作った直後の最初のcommitだけは、PRのbaseが無いため`main`へ直接pushしました（README と
.gitignore）。以後は例外を作りません。

CI は言語確定後に定義する。

## Branch protection／ruleset

このリポジトリは Public なので（[ADR 0002](decisions/0002-public-repository.md)）、運用の注意ではなく
GitHub の branch protection／ruleset で`main`を守ります。

- `main`への直接push禁止
- force push禁止
- PR必須
- 必須checkは、CIを定義した後に追加する

## Branch命名

branch名は`<type>/<issue-number>-<short-description>`とします。
`short-description`は短いlowercaseのkebab-caseを使用します。

| type | 用途 | 例 |
| --- | --- | --- |
| `feat` | 機能追加 | `feat/12-inspect-csv` |
| `fix` | 不具合修正 | `fix/13-reject-invalid-row` |
| `docs` | 文書だけの変更 | `docs/14-domain-rules` |
| `test` | テストだけの変更 | `test/15-upload-boundary` |
| `chore` | 依存、CI、保守作業 | `chore/16-ci` |

原則として1 branch／1 PRは1 Issueだけを扱います。進行Issueを直接実装単位にせず、実際の変更を追跡する
Issue番号を使用します。無関係な修正を同じbranchへ混ぜません。

## 通常workflow

### 1. 開始

作業ツリーがcleanであることを確認し、`main`をfast-forwardだけで最新化してからbranchを作成します。

```bash
git status --short --branch
git switch main
git fetch --prune origin
git merge --ff-only origin/main
git switch -c <type>/<issue-number>-<short-description>
```

未commit変更、想定外のbranch、`main`と`origin/main`の分岐がある場合は開始せず、既存作業の所有者と
扱いを確認します。確認せずにstash、破棄、force updateを行いません。

### 2. 変更とローカル検証

Issueの完了条件を満たす最小変更に限定します。変更箇所に近い確認から始め、pass、fail、skip、未実行と
理由を区別して記録します。

### 3. Commit、push、PR

```bash
git status --short
git diff --check
git add <confirmed-paths>
git commit -m "<type>: <summary>"
git push -u origin <branch-name>
```

自分だけのbranchは、PR作成前であればfixup／squashでcommitを整えて構いません。PR作成後は
rebase、amend、force pushでbranchを書き換えず、修正は追加のcommitで行います。

PRのbaseは`main`とし、[PR template](../.github/pull_request_template.md)に沿って、目的と変更内容、
確認したこと（pass／fail／skip／未実行と理由）、関連Issueを書きます。

self-reviewではIssue scope、意図しない差分、秘密情報、実データ、東証の個別回答の内容、個人を特定できる
情報が無いことを確認します。CIを定義した後は、対象head SHAに紐付く全workflow runの成功を確認するまで
mergeしません。

### 4. Merge commitとmain確認

PRはGitHubのMerge commitで統合します。branchのcommitはそのまま`main`の祖先として残り、PR単位
（通常は1 Issue）の区切りはmerge commitが表します。GitHubのrepository settingsではMerge commitだけを
許可し、Squash mergeとRebase mergeを無効にします。Rebase mergeはcommitを書き換えるため、CIを通した
SHAが残らず、branchも`main`の祖先にならないので採りません。

merge前に最新の`main`をbranchへmergeして追いつかせ、そのheadでPRの確認を通します。branchが最新の
`main`を含めば、merge commitのtreeはPR headのtreeと一致し、PRで確認した内容と`main`に入る内容が
同じになります。

```bash
git fetch origin
git merge origin/main
git push
```

merge commitも`main`上の新しいcommitなので、merge後の`main`を確認します。失敗した場合は完了扱いにせず、
新しい`fix/<issue>-...`等でrepositoryから修正します。

`main`の履歴は`git log --first-parent main`で読みます。1 PRが1行に見えます。PRを戻すときは
`git revert -m 1 <merge commit SHA>`でPR単位に戻します。

### 5. Cleanup

PRが`MERGED`であり、merge後の`main`を確認してからremote／local branchを削除します。

```bash
git switch main
git fetch --prune origin
git merge --ff-only origin/main
git push origin --delete <branch-name>  # GitHub側で未削除の場合だけ
git branch -d <branch-name>
```

Merge commitではbranchのcommitが`main`の祖先になるため、`git branch -d`で削除できます。拒否された
場合は未統合のcommitが残っているので、削除せずに理由を確認します。worktreeや`MERGED`以外の
branchの扱いは[Branchのlifecycleとcleanup](#branchのlifecycleとcleanup)に従います。

## Branchのlifecycleとcleanup

branchは作業分離のための一時的なものです。進捗の識別子として残しません。

- 開始：最新でcleanな`main`から[Branch命名](#branch命名)の名前で作成する
- 寿命：1 Issueの1 PRが閉じるまで
- 終了：PRが`MERGED`になり`main`統合を確認した時点、または作業をやめると決めた時点

| 状態 | 扱い |
| --- | --- |
| `MERGED` | `main`統合を確認してから削除する |
| `CLOSED`・未merge | abandoned、superseded、別Issueへ移管済みなら原則削除する。削除前に本人へ確認する |
| `OPEN` | 維持する。所有者と状態はPRと関連Issueで追う |
| PRなし | 作業中なら維持する。作業が止まっていれば`CLOSED`・未mergeと同じ基準で扱う |

削除せずに維持する場合は、関連Issueに所有者、関連Open Issue、再開条件、次の確認時期を記録します。

Cleanupは次の順で行います。worktreeが使用中のbranchは削除できないため、worktreeを先に外します。

```bash
git worktree list
git worktree remove <path>              # cleanで自分の作業のworktreeだけ
git push origin --delete <branch-name>  # GitHub側で未削除の場合だけ
git fetch --prune origin                # remote-tracking refを整理する
git branch -d <branch-name>
```

dirty worktree、他の作業（別のチャット・agent・人）が所有するworktreeやbranch、detached HEADは、
確認せずにstash、破棄、force updateを行いません。所有者と扱いを確認し、残す場合は上記を記録します。

Agentが自分で判断して削除してよいのは、`MERGED`済みで`main`統合を確認したbranch
（`git branch -d`と、対応するremote branch・remote-tracking refの整理）だけです。`CLOSED`・未merge、
作業が止まったPRなしのbranch、dirty worktree、他の作業が所有するもの、どのbranchにも含まれない
detached HEADのcommit、`git branch -d`が拒否したbranchは、削除前に本人へ確認します。
branch削除自体も、ユーザーが指定した作業境界に従います。

## Codex／agentによる作業

Codex等のagentもこのworkflowに従います。

- 作業前にIssue、`main`、working tree、関連文書を確認する
- 最新`main`からIssue番号付きshort-lived branchを作成する
- 通常変更を`main`へ直接commit／pushしない
- 要件を満たす最小変更とし、無関係なrefactor、rename、依存更新を混ぜない
- 必要なローカル検証、PR、self-reviewを経てMerge commitで統合する
- commit、push、PR、merge、branch削除はユーザーが指定した作業境界に従う
- 完了時に変更、検証結果、skip／未実行、互換性、残存リスクを報告する

詳細な開発規則は[`AGENTS.md`](../AGENTS.md)を併せて適用します。

## 禁止／非推奨

- 通常変更の`main`への直接commit／push
- `main`のforce push、削除、履歴書換え
- PR作成後のbranchの書換え（rebase、amend、force push）
- Squash merge、Rebase merge
- Issueなしの実装branch、複数Issueの無関係な変更を含むPR
- `develop`、常設`release/*`、GitFlowの導入
- 秘密情報、実データ、東証の個別回答の内容、個人を特定できる情報を含むbranch名、commit、PR、Issue、tag
