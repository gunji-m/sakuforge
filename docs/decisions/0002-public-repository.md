# ADR 0002: リポジトリを Public にする

ADR は「何をどう決めたか、理由は何か」を1件ずつ残す短い決定記録です。設計書ではなく、判断の履歴です。

- Status: Accepted
- Date: 2026-10-30
- Related: [ADR 0001](0001-declaration-and-origin.md)、#3

## 背景

tfdata-api は private repository で、GitHub の現プランでは branch protection／ruleset を使えず、
GitHub Actions の月間枠にも制限がありました。後継の sakuforge は利用者データを預からないため
（[ADR 0001](0001-declaration-and-origin.md)）、リポジトリに置くものは宣言、規則、合成データ、コードだけに
なります。

本人は 2026-10-30 に、このリポジトリを Public で作成すると決めました。

## 決定

gunji-m/sakuforge を **Public** にします。

### 理由

- GitHub Actions を無制限に使える
- branch protection／ruleset を無料で使える
- secret scanning と push protection を使える
- Dependabot を使える

### 条件

Public で公開しても問題を起こさないよう、次を守ります。

- 銘柄マスター JSON をリポジトリに入れない。東証データの再配布になり得るため。配布境界の確認は #3 で行う
- 東証からの個別回答の内容を書かない（原文は本人が private に保持する）
- 秘密情報と招待の合言葉を置かない
- Issue、PR、commit に個人を特定できる情報を書かない
- 実データを置かない。テストと例は合成データだけにする
- LICENSE を決める（本人判断）

## 検討した他の案

- **private のまま始める。** tfdata-api と同じく branch protection が使えず、運用で代替する手間が残る。
  利用者データを預からないので、Public にして失うものは上の条件で抑えられる。採らない

## この決定で起きること

**良い面**

- main への直接 push 禁止、force push 禁止、PR 必須を、運用の注意ではなく設定で守れる
- 秘密情報の混入を push の時点で止められる
- CI の実行回数を気にせずに済む

**負担になる面**

- 書いたものはすべて誰でも読める。Issue や PR に東証の回答、実データ、個人情報を書かない注意が常に要る
- LICENSE が無い間は、他者がコードを再利用できる条件が明示されない

**この決定では解消しないこと**

- LICENSE は未決で、本人が選ぶ
- 銘柄マスター JSON の配布境界の確認は #3 で追う

## 見直す条件

- #3 の確認で、銘柄マスターや関連情報をリポジトリに置く必要が出たのに、Public では置けないと分かったとき
- 招待の仕組みなど、公開できない設定がリポジトリに必要になったとき
