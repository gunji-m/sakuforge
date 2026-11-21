# 運用手順

Vercel に載せたアプリを、確かめる・公開する・止める・戻す・使用量を見る・秘密を入れ替える・月次の銘柄マスターの更新を確かめるための手順です（#114、#201）。
[設計](design.md)の 7 節で「開発者：安全網」とした操作を、ここに書きます。Vercel の設定と秘密の操作は、
すべて本人が行います（`AGENTS.md` の Human approval）。

秘密の値、配備の URL、非公開のリポジトリの名前、トークンの期限の日付は、この文書にも Issue・PR にも書きません。
画面の名前は 2026-11-17 時点の Vercel のものです。

## 1. 今の配備の形

| 項目 | 値 | 正本 |
| --- | --- | --- |
| プラン | Hobby（非商用・無課金・宣伝なしの間だけ） | [ADR 0006](decisions/0006-unlisted-public-release.md) |
| Root Directory | `apps/web` | Vercel の画面 |
| Build Command | `pnpm run build`（銘柄マスターの取得を含む。`next build` で上書きしない） | `apps/web/package.json` |
| Node・pnpm | Node は `engines` の `24.x`、pnpm は `packageManager` の版（Vercel は両方を読む） | `package.json` |
| 関数のリージョン・最大実行時間 | `hnd1`（東京）・10 秒 | リージョンは `apps/web/vercel.json` の `regions`、最大実行時間は `apps/web/app/api/inspect/route.ts` の `maxDuration`。[設計](design.md)の 5 節 |
| 本番のブランチ | `main`。本番のドメインへの自動の割り当て（Auto-assign Custom Production Domains）は今はオフ。オンに戻すと決めた（案 A、#201） | Vercel の画面 |
| 配備の保護 | Vercel Authentication（Standard Protection） | Vercel の画面 |
| 環境変数 | `STOCK_MASTER_TOKEN`・`STOCK_MASTER_URL`（Production だけ、Type は Secret） | [設計](design.md)の 4.6 |

- リージョンと最大実行時間はコードが正本です。Vercel の画面（Settings → Functions）にも同じ値を入れてあります。
  変えるときは `route.ts` を PR で変え、画面も同じ値に合わせます。画面だけで変えません
- 自動の割り当てがオフの間は、`main` に merge すると Production として build されますが、本番のドメインには
  出ません（Staged）。本番に出すのは 3 の手順だけです
- 自動の割り当ては、オンに戻すと決めました（2026-11-21、#201 の案 A）。build が通った Production の配備は、そのまま
  本番に出ます。月次の銘柄マスターの更新（6）も Promote なしで本番に出ます。壊れた銘柄マスターは build が失敗し、
  前の配備が残ります（[設計](design.md)の 4.4）。オンに戻すのは本人の操作です
- Build Command を `next build` にすると銘柄マスターの取得が飛ばされ、build が `stock master rejected: unreadable` で
  止まります。`STOCK_MASTER_URL` は GitHub の contents API の形（`https://api.github.com/repos/<owner>/<repo>/contents/<path>`、
  既定以外のブランチなら `?ref=<branch>`）にします。ブラウザの `github.com/.../blob/...` の形だと `http_404` になります（#113）

## 2. 配備を確かめる

配備ごとの URL は保護されています。画面の送信は `credentials: "omit"`（`apps/web/src/client/submit.ts`）なので、ブラウザから
CSV を送っても保護に止められます。関数を確かめるときは、合鍵（5.3）をヘッダーに付けて `curl` で送ります。

```bash
curl -s -i -X POST \
  -H "Content-Type: text/csv" \
  -H "x-vercel-protection-bypass: $(cat local-data/vercel-bypass.txt)" \
  --data-binary @<合成の CSV> \
  "<配備ごとの URL>/api/inspect"
```

- `-i` で応答ヘッダーも出します。ページや静的ファイルは、`-X POST` と本文を外した `GET` で同じように確かめます
- 送る CSV は合成データにします。実際の CSV を送るときは、応答を手元で絞り、表示も記録もしません（#113）
- 確かめること：応答の `x-vercel-id` が `hnd1::hnd1::…`（受け付けも処理も東京）、`docs/design.md` 7.1 のヘッダーと
  `X-Robots-Tag: noindex, nofollow`、検査の結果
- 関数の実行時間と最大実行時間は、Logs → Request Logs で要求の行を開き、「Execution Duration / Maximum」で見ます
- 配備ごとの URL は、Deployments で配備を開いた画面の Domains にあります。`main` の最新の配備は、ブランチの別名の URL でも開けます

## 3. 公開する（本番のドメインへ出す）

1. 2 の手順で、出したい配備を確かめる
2. Deployments で、その配備の「…」→ Promote → Promote。build し直さずに、そのまま本番のドメインに出ます
3. 本番のドメインで、2 と同じ確かめをする（合鍵は要りません。保護は配備ごとの URL に掛かっています）

- 自動の割り当ては、Settings → Environments → Production → Branch Tracking の Auto-assign Custom Production Domains で
  オンに戻します（1 の案 A）。オフの間は、毎回この手順で出します
- 公開したら、合鍵を消します（5.3）

## 4. 止める・戻す・使用量を見る

### 4.1 手で止める

攻撃や想定外の使用量のとき、プロジェクトを止めます（[設計](design.md)の 7 節の 1 行目の安全網）。

- 止める：Settings → General → Pause Project → プロジェクト名を入力 → Pause Project。本番の配備は
  `503 DEPLOYMENT_PAUSED` を返します
- 再開する：Settings → General → Resume Project。数分で戻り、再配備は要りません

### 4.2 前の配備へ戻す

壊れた配備を本番に出してしまったときに使います。

- Deployments で `main` に絞り、戻したい配備の「…」→ Instant Rollback → 確かめて Confirm Rollback
- Hobby では、1 つ前に本番に出ていた配備にだけ戻せます
- 戻すと、本番のドメインへの自動の割り当てはオフになります。オフの間は、`main` の merge も月次の銘柄マスターの更新も
  本番に出ません
- 直した配備を 3 の Promote で出したら、Settings → Environments → Production → Branch Tracking で自動の割り当てが
  オンになっていることを確かめ、オフならオンに戻します。戻し忘れると、翌月の銘柄マスターの更新が本番に出ません

### 4.3 使用量を見る

- Vercel の左の一覧の Usage で見ます。関数の Active CPU、Provisioned Memory、呼び出しの回数、転送量が、Hobby の無料枠に対してどれだけかが出ます
- Hobby は請求がありません。無料枠を超えると、その機能は 30 日たつまで使えなくなり、止まった本番の配備は
  `503 DEPLOYMENT_PAUSED` を返します。自動では戻らないので、サポートに連絡するか Pro に移します
- 有料にしない（ADR 0006）ので、Pro に移すときは ADR を見直してから決めます
- リージョンを `hnd1` にしてから、無料枠の減り方が変わらないかを見ます（#114）

## 5. 秘密の入れ替え

### 5.1 銘柄マスターを読むトークン

`STOCK_MASTER_TOKEN` は、非公開のリポジトリ 1 つの内容を読むだけの fine-grained token です（[設計](design.md)の 4.6）。
期限があり、期限が切れると Production の build が `stock master rejected` で止まります（前の配備は残ります）。

1. 期限の前に、GitHub で同じ範囲（対象は非公開のリポジトリ 1 つ、Contents: Read-only）の新しいトークンを作る
2. Vercel の Settings → Environment Variables で `STOCK_MASTER_TOKEN` を新しい値にする（Production だけ、Type は Secret）
3. `main` の最新の配備を Redeploy し、Build Logs に `stock master fetched` と `stock master validated` が出ることを確かめる
4. GitHub で古いトークンを消す

- 期限の日付は、この文書に書かず、本人の手元（パスワードの管理など）で持ちます
- 漏れた心配があれば、期限を待たずに同じ手順で入れ替えます

### 5.2 Deploy Hook

銘柄マスターを更新したときに Production を build し直すための URL です。Vercel の Settings → Git → Deploy Hooks で作り、
非公開のリポジトリの secret に置きます（[設計](design.md)の 4.6）。

- URL を知っていれば誰でも build を起こせるので、トークンと同じに扱います
- 漏れた心配があれば、Deploy Hooks で消して作り直し、非公開のリポジトリの secret を新しい URL にします

### 5.3 配備の保護の合鍵

配備ごとの URL の保護の内側へ `curl` で送るための、Protection Bypass for Automation の合鍵です（2026-11-17 に本人が決めた）。

- 公開まで 1 本を使い回します。置き場所は、本人の手元の git の対象外のファイル（`local-data/vercel-bypass.txt`）と、パスワードの管理です
- 値を表示しません。URL のクエリに付けず、ヘッダー `x-vercel-protection-bypass` で渡します
- 公開したら消します。漏れた心配があれば、すぐ作り直します
- 作る・消す・作り直すのは、Settings → Deployment Protection → Protection Bypass for Automation です。作り直すと
  古い合鍵では前の配備に入れなくなるので、確かめたい配備は再配備します

## 6. 月次の銘柄マスターの更新

本番の銘柄マスターは、月 1 回の更新で先月末の基準日に替わります（[設計](design.md)の 4.1）。基準日が古くても関数は
止まらない（[設計](design.md)の 4.4）ので、更新が本番に出たかは、毎月この節の手順で確かめます（#201）。

### 6.1 毎月起きること

1. 非公開のリポジトリの定期実行が、東証の月次 Excel から JSON を作って commit し、Deploy Hook（5.2）を呼ぶ
2. Vercel が `main` の Production を build し直す。build の前に JSON を取得し、build で検証する（[設計](design.md)の 4.5）
3. build が通れば、自動の割り当て（1）で本番のドメインに出る。失敗すれば前の配備が本番に残る

### 6.2 本番の基準日を確かめる

更新の定期実行が終わったころに、次のどちらかで、本番の基準日が先月末になっていることを確かめます。

- 本番のドメインで画面を開き、ヘッダーの出典の行の「（YYYY年M月末時点）」を見る
- 本番のドメインの `/api/inspect` に合成の CSV を送り（2 の `curl` から合鍵のヘッダーを外したもの）、応答の
  `stockMaster.asOf` を見る

送る CSV は合成データにします。東証の公開が遅れた月は、基準日が先々月末のままでも誤りではありません
（[外部データとの約束](external-data-policy.md)の 3 節。月末時点の一覧を最新のように扱わない）。

### 6.3 更新が出ていないときに見る場所

上から順に見ます。

| 順 | 見る場所 | 分かること |
| --- | --- | --- |
| 1 | 非公開のリポジトリの定期実行の結果 | 生成か形の確認で止まり、Deploy Hook を呼んでいない（[設計](design.md)の 4.4 の 1 行目） |
| 2 | Vercel の Deployments（`main` の Production） | Hook の後に配備が作られたか。作られていなければ、Hook の URL（5.2）と呼び出しの回数の上限を疑う |
| 3 | その配備の Build Logs | `stock master fetched` と `stock master validated`（基準日が出る）が出たか。`stock master fetch failed` なら取得の失敗（トークンの期限切れは 5.1）、`stock master rejected` なら検証の失敗で、どちらも後ろの理由の語を見る |
| 4 | 配備の状態 | build は通ったが Staged のままなら、自動の割り当てがオフになっている。3 の Promote で出し、4.2 のとおりオンに戻す |

### 6.4 build の失敗に気づく経路

build の失敗では本番は止まらないので、Vercel の通知で気づきます（Vercel の資料「Notifications」）。

- Deployment Failures の通知は、配備の作成者（deployment owner）に Web と email で届きます。既定でオンなので、
  Team の Settings → My Notifications でオフにしません
- Deploy Hook から始まった配備の作成者が誰になるかは、資料に書かれていません。最初の月次の更新（または試しに Hook を
  呼んだとき）に、Deployments の作成者の欄と、失敗の通知が本人に届くかを確かめます（本人の操作。まだ確かめていない）
- 通知が届かない形だと分かったら、6.2 の毎月の確かめで気づきます。そのときは通知の代わりを Issue を立てて決めます
