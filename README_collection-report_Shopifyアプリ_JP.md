# CollectionReport — コレクション売上レポート自動送信Shopifyアプリ

> **何を:** 指定コレクションの売上・在庫データを定期集計し、Slack Block Kit形式で自動送信するShopify Embedded App
> **誰に:** 中〜大規模Shopifyマーチャント、EC運用チーム
> **技術:** Remix · TypeScript · Prisma + SQLite · Polaris React · Shopify GraphQL Admin API · Slack Incoming Webhooks

**ソースコード:** [github.com/mer-prog/collection-report](https://github.com/mer-prog/collection-report)

---

## このプロジェクトで証明できるスキル

| スキル | 実装内容 |
|--------|----------|
| Shopifyアプリ開発 | Shopify App Template (Remix) ベースのEmbedded App。OAuth認証、Webhook処理、GraphQL Admin APIによる商品・注文データ取得を実装 |
| フルスタック設計 | Remixのloader/actionパターンでフロント・バックエンドを統合。サービス層（レポート生成・スケジューラ・Slack送信）を分離した3層構成 |
| データベース設計 | Prisma ORMによるスキーマ設計（Session / ReportConfig / ReportLog）。マイグレーション管理、リレーション・カスケード削除を実装 |
| 外部API連携 | Slack Incoming Webhook APIへのBlock Kit形式メッセージ送信。通貨フォーマット・在庫アラート等のデータ整形ロジック |
| スケジューリング設計 | 外部Cron（cron-job.org）+ ベアラートークン認証のAPIエンドポイント。日次/週次/月次スケジュール判定、30分のドリフト許容、重複送信防止ロジック |
| 国際化（i18n） | React Context + localStorage による日英切替。105キーの翻訳ファイル、パラメータ補間対応 |
| マルチテナント設計 | `shop` フィールドによるテナント分離。ショップ間のデータ漏洩を防止 |

---

## 技術スタック

| カテゴリ | 技術 | バージョン | 用途 |
|----------|------|-----------|------|
| フレームワーク | Remix (Shopify App Template) | ^2.16.1 | SSR、ファイルベースルーティング、loader/actionパターン |
| 言語 | TypeScript | ^5.2.2 | 型安全な開発 |
| UIライブラリ | Polaris React | ^12.0.0 | Shopify管理画面準拠のUIコンポーネント |
| データベース | Prisma + SQLite | ^6.2.1 | ORM、マイグレーション管理、セッションストレージ |
| API | Shopify GraphQL Admin API | 2025-01 | 商品・注文・在庫データの取得 |
| 認証 | Shopify App Bridge React | ^4.1.6 | Embedded App認証、OAuth管理 |
| セッション管理 | shopify-app-session-storage-prisma | ^8.0.0 | Prismaベースのセッション永続化 |
| 外部連携 | Slack Incoming Webhooks | - | Block Kit形式でのレポート送信 |
| スケジューリング | cron-job.org | - | 外部Cronサービスによる定期実行 |
| ビルドツール | Vite | ^6.2.2 | HMR、本番ビルド |
| ランタイム | Node.js | >=20.19 <22 \|\| >=22.12 | サーバー実行環境 |
| コード品質 | ESLint + Prettier | ^8.42.0 / ^3.2.4 | リンティング・フォーマット |

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                     Shopify Admin (埋め込みアプリ)                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Polaris React UI                        │  │
│  │  ダッシュボード │ レポート作成 │ 編集 │ プレビュー        │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │ Remix loader / action                 │
│  ┌───────────────────────▼───────────────────────────────────┐  │
│  │                    Remix サーバー                          │  │
│  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────┐   │  │
│  │  │ report-     │ │ scheduler    │ │ slack-sender      │   │  │
│  │  │ generator   │ │ .server.ts   │ │ .server.ts        │   │  │
│  │  │ .server.ts  │ │ (52行)       │ │ (116行)           │   │  │
│  │  │ (296行)     │ │              │ │                   │   │  │
│  │  └──────┬──────┘ └──────────────┘ └────────┬──────────┘   │  │
│  │         │                                   │              │  │
│  └─────────┼───────────────────────────────────┼──────────────┘  │
│            │                                   │                 │
└────────────┼───────────────────────────────────┼─────────────────┘
             │                                   │
     ┌───────▼───────┐                   ┌───────▼───────┐
     │ Shopify       │                   │ Slack         │
     │ GraphQL API   │                   │ Webhook API   │
     │ (商品・注文)   │                   │ (Block Kit)   │
     └───────────────┘                   └───────────────┘

     ┌───────────────┐                   ┌───────────────┐
     │ Prisma        │                   │ cron-job.org  │
     │ + SQLite      │                   │ (外部Cron)    │
     │ (Session /    │                   │      │        │
     │  ReportConfig │◄──────────────────│ POST /api/cron│
     │  / ReportLog) │                   │ Bearer認証    │
     └───────────────┘                   └───────────────┘
```

---

## 主要機能

### 1. レポート設定ダッシュボード（`app/routes/app._index.tsx` — 321行）
設定済みレポートの一覧をIndexTableで表示。各行にコレクション名、ステータスバッジ、スケジュール、連携期間、最終送信日時を表示。「今すぐ送信」「編集」「削除」「有効/無効切替」のアクションを提供。空状態ではレポート作成への導線を表示。

### 2. レポート作成（`app/routes/app.reports.new.tsx` — 280行）
Shopify ResourcePickerでコレクション選択、送信頻度（日次/週次/月次）・送信時刻・曜日/日付の設定、連携期間（開始日・終了日）の任意設定、Slack Webhook URLの入力。バリデーション付きのフォームでReportConfigをPrismaに保存。

### 3. レポート編集・送信ログ（`app/routes/app.reports.$id.tsx` — 381行）
作成済みレポートの全設定を編集可能。直近10件の送信ログ（成功/失敗バッジ・送信日時・送信先・エラーメッセージ）を表示。ステータスバッジ（稼働中/開始待ち/期間終了/無効）をページ上部に表示。

### 4. レポートプレビュー（`app/routes/app.reports.$id.preview.tsx` — 186行）
Shopify GraphQL APIからリアルタイムデータを取得し、Slack Block Kit形式のプレビューをPolaris UIで表示。コレクション名、期間、売上合計、注文件数、平均注文額、売上上位3商品、在庫少商品アラートを確認可能。

### 5. レポート生成エンジン（`app/services/report-generator.server.ts` — 296行）
Shopify GraphQL Admin APIからコレクション商品一覧と過去30日分の注文データをページネーション付きで取得。コレクション内商品のみの売上を集計し、売上上位5商品と在庫10個以下の商品を抽出。`CollectionReportData` インターフェースに整形して返却。

### 6. Slack送信（`app/services/slack-sender.server.ts` — 116行）
`CollectionReportData` をSlack Block Kit形式（ヘッダー、フィールドセクション、売上上位商品、在庫少アラート）に変換し、Incoming Webhook URLへPOST送信。通貨は日本円（¥）でロケール対応のフォーマット。

### 7. スケジューラ（`app/services/scheduler.server.ts` — 52行）
`shouldRunNow()` 関数で実行判定。連携期間チェック（validFrom/validUntil）、有効フラグ確認、30分のドリフト許容範囲内の時刻照合、当日の重複送信防止、日次/週次（曜日）/月次（日付）の条件判定を実施。`getReportStatus()` でステータス（稼働中/開始待ち/期間終了/無効）を算出。

### 8. 外部Cronエンドポイント（`app/routes/api.cron.tsx` — 96行）
POST `/api/cron` でcron-job.orgから定期呼び出し。`Authorization: Bearer {CRON_SECRET}` で認証。全アクティブなReportConfigを取得し、`shouldRunNow()` で実行対象を判定。対象ごとにレポート生成→Slack送信→ログ記録を実行。レスポンスに処理件数と各結果（成功/失敗）を返却。

### 9. Webhook処理
- `app/uninstalled`（17行）: アプリアンインストール時にSessionを削除（カスケードで関連データも削除）
- `app/scopes_update`（21行）: APIスコープ変更時にSession.scopeを更新

### 10. 日英切替（`app/i18n/` — 4ファイル）
React Context + `useTranslation()` フックによるクライアントサイドi18n。`localStorage` でロケール永続化（デフォルト: 日本語）。105キーの翻訳ファイル（en.json / ja.json）でダッシュボード・フォーム・プレビュー等の全テキストをカバー。パラメータ補間・配列アクセス対応。

---

## データベース設計

```
┌─────────────────────────────┐
│         Session             │
├─────────────────────────────┤
│ id          STRING PK       │
│ shop        STRING          │
│ state       STRING          │
│ isOnline    BOOLEAN         │
│ scope       STRING?         │
│ expires     DATETIME?       │
│ accessToken STRING          │
│ userId      BIGINT?         │
│ firstName   STRING?         │
│ lastName    STRING?         │
│ email       STRING?         │
│ accountOwner BOOLEAN        │
│ locale      STRING?         │
│ collaborator BOOLEAN?       │
│ emailVerified BOOLEAN?      │
│ refreshToken STRING?        │
│ refreshTokenExpires DATETIME│
└─────────────────────────────┘

┌─────────────────────────────┐      ┌─────────────────────────┐
│       ReportConfig          │      │       ReportLog         │
├─────────────────────────────┤      ├─────────────────────────┤
│ id              STRING PK   │──1:N─│ id        STRING PK     │
│ shop            STRING      │      │ configId  STRING FK     │
│ collectionId    STRING      │      │ status    STRING        │
│ collectionTitle STRING      │      │           (success/failed)
│ schedule        STRING      │      │ sentTo    STRING        │
│   (daily/weekly/monthly)    │      │           (slack)       │
│ scheduleTime    STRING      │      │ errorMsg  STRING?       │
│   (HH:MM形式)              │      │ createdAt DATETIME      │
│ scheduleDay     INT?        │      └─────────────────────────┘
│   (週: 0-6 / 月: 1-31)     │
│ slackWebhookUrl STRING?     │
│ isActive        BOOLEAN     │
│ validFrom       DATETIME?   │
│ validUntil      DATETIME?   │
│ lastSentAt      DATETIME?   │
│ createdAt       DATETIME    │
└─────────────────────────────┘

リレーション: ReportConfig 1 : N ReportLog（onDelete: Cascade）
```

---

## APIエンドポイント

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/app` | Shopify Admin | ダッシュボード（レポート設定一覧取得） |
| POST | `/app` | Shopify Admin | アクション実行（今すぐ送信 / 削除 / 有効無効切替） |
| GET | `/app/reports/new` | Shopify Admin | 新規レポート作成フォーム |
| POST | `/app/reports/new` | Shopify Admin | レポート設定の保存 |
| GET | `/app/reports/:id` | Shopify Admin | レポート編集フォーム + 送信ログ表示 |
| POST | `/app/reports/:id` | Shopify Admin | レポート設定の更新 |
| GET | `/app/reports/:id/preview` | Shopify Admin | レポートプレビュー（リアルタイムデータ） |
| POST | `/api/cron` | Bearer トークン | 定期実行トリガー（cron-job.orgから呼び出し） |
| POST | `/webhooks/app/uninstalled` | Shopify署名 | アプリアンインストールWebhook |
| POST | `/webhooks/app/scopes_update` | Shopify署名 | スコープ更新Webhook |

---

## 画面仕様

### ダッシュボード（`/app`）
- IndexTableによるレポート設定一覧
- 列: コレクション名 / ステータス / スケジュール / 連携期間 / 最終送信日時 / アクション
- ステータスバッジ: 稼働中（緑）/ 開始待ち（青）/ 期間終了（黄）/ 無効（赤）
- アクション: 今すぐ送信 / 編集 / 削除 / 有効無効切替
- 空状態: レポート作成への導線（EmptyState）
- 言語切替ボタン（右上）

### レポート作成（`/app/reports/new`）
- コレクション選択（Shopify ResourcePicker）
- 送信頻度選択（日次/週次/月次）
- 送信時刻設定（HH:MM）
- 曜日選択（週次の場合）/ 日付入力（月次の場合）
- 連携期間設定（任意 — 開始日・終了日のチェックボックス + 日付ピッカー）
- Slack Webhook URL入力

### レポート編集（`/app/reports/:id`）
- 作成フォームと同一項目（全て編集可能）
- ステータスバッジ表示
- 直近10件の送信ログ一覧
- プレビューボタン

### レポートプレビュー（`/app/reports/:id/preview`）
- コレクション名ヘッダー
- グリッド表示: 期間 / 売上合計 / 注文件数 / 平均注文額
- 売上上位3商品（販売数・売上・在庫）
- 在庫少商品アラート（在庫10個以下）

---

## プロジェクト構成

```
collection-report/                         59ファイル（node_modules/build除く）
├── app/                                   TypeScript/TSX 26ファイル (2,241行)
│   ├── routes/
│   │   ├── app.tsx                  52行   レイアウトラッパー（認証・AppBridge初期化）
│   │   ├── app._index.tsx          321行   ダッシュボード（一覧・アクション処理）
│   │   ├── app.reports.new.tsx     280行   レポート新規作成フォーム
│   │   ├── app.reports.$id.tsx     381行   レポート編集 + 送信ログ
│   │   ├── app.reports.$id.preview.tsx 186行  レポートプレビュー
│   │   ├── api.cron.tsx             96行   Cronエンドポイント
│   │   ├── _index/
│   │   │   ├── route.tsx            58行   ランディングページ
│   │   │   └── styles.module.css    73行   ランディングページ用スタイル
│   │   ├── auth.login/
│   │   │   ├── route.tsx            68行   ログインフォーム
│   │   │   └── error.server.tsx     16行   ログインエラー処理
│   │   ├── auth.$.tsx                8行   OAuthコールバック
│   │   ├── webhooks.app.scopes_update.tsx  21行  スコープ更新Webhook
│   │   └── webhooks.app.uninstalled.tsx    17行  アンインストールWebhook
│   ├── services/
│   │   ├── report-generator.server.ts 296行  レポートデータ生成（GraphQL集計）
│   │   ├── scheduler.server.ts        52行  スケジュール判定ロジック
│   │   └── slack-sender.server.ts    116行  Slack Block Kit送信
│   ├── i18n/
│   │   ├── i18nContext.tsx           99行   i18n Context Provider + フック
│   │   ├── LanguageToggle.tsx        30行   言語切替UIコンポーネント
│   │   ├── en.json                  105行   英語翻訳
│   │   └── ja.json                  105行   日本語翻訳
│   ├── shopify.server.ts             36行   Shopifyアプリ設定
│   ├── db.server.ts                  15行   Prismaクライアント初期化
│   ├── root.tsx                      30行   HTMLドキュメントルート
│   ├── entry.server.tsx              59行   SSRハンドラー（ストリーミング対応）
│   ├── routes.ts                      3行   フラットルート設定
│   └── globals.d.ts                        CSSモジュール型定義
├── prisma/
│   ├── schema.prisma                 62行   データベーススキーマ（3モデル）
│   └── migrations/                         マイグレーション（2件）
├── package.json                      78行   依存関係定義
├── vite.config.ts                    73行   Viteビルド設定（HMR・プラグイン）
├── tsconfig.json                     21行   TypeScript設定
├── shopify.app.toml                  28行   Shopifyアプリ設定（スコープ・Webhook）
├── shopify.web.toml                   7行   Web設定
├── Dockerfile                        22行   本番デプロイ用（node:18-alpine）
├── CLAUDE.md                        193行   プロジェクト仕様
├── README.md                         74行   ユーザー向けドキュメント
└── CHANGELOG.md                      95行   バージョン履歴
```

---

## セットアップ

### 前提条件

- [Node.js](https://nodejs.org/) >=20.19 <22 または >=22.12
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- Shopify開発ストア
- Slackワークスペース + Incoming Webhook URL

### 手順

```bash
# リポジトリのクローン
git clone https://github.com/mer-prog/collection-report.git
cd collection-report

# 依存関係のインストール
npm install

# データベースのセットアップ
npx prisma migrate dev

# 開発サーバーの起動
shopify app dev

# 本番デプロイ
shopify app deploy
```

### 環境変数

| 変数 | 説明 | 必須 |
|------|------|------|
| `SHOPIFY_API_KEY` | ShopifyアプリのAPIキー（Partner Dashboardから取得） | はい |
| `SHOPIFY_API_SECRET` | Shopifyアプリのシークレットキー | はい |
| `SHOPIFY_APP_URL` | アプリの公開HTTPS URL | はい |
| `SCOPES` | APIスコープ（`read_products,read_orders,read_inventory`） | はい |
| `CRON_SECRET` | `/api/cron` エンドポイントのBearerトークン | はい |
| `PORT` | サーバーポート（デフォルト: 3000） | いいえ |
| `FRONTEND_PORT` | HMRポート（デフォルト: 8002） | いいえ |

---

## セキュリティ設計

| 対策 | 実装内容 |
|------|----------|
| APIスコープ最小化 | `read_products`, `read_orders`, `read_inventory` の読み取り専用スコープのみ要求 |
| Cronエンドポイント認証 | `Authorization: Bearer {CRON_SECRET}` ヘッダーによるトークン認証。不正リクエストは401を返却 |
| Webhook署名検証 | Shopifyライブラリが全Webhookリクエストの署名を自動検証 |
| セッション管理 | Prismaベースのセッションストレージ。有効期限付きアクセストークン + リフレッシュトークンローテーション対応 |
| マルチテナント分離 | 全ReportConfig/ReportLogクエリに `shop` フィールドでのフィルタリングを適用。ショップ間のデータアクセスを防止 |
| POSTメソッド限定 | `/api/cron` エンドポイントはPOSTのみ受付。GET等は405を返却 |

---

## 設計判断の根拠

| 判断 | 根拠 |
|------|------|
| Remix (Shopify App Template) 採用 | Shopify公式テンプレートにより認証・Webhook・App Bridgeの統合が標準化。loader/actionパターンでSSR + フォーム処理が簡潔 |
| SQLite + Prisma | MVP段階で十分な性能。マイグレーション管理が容易で、本番移行時にPostgreSQL等への切替がPrismaのアダプタ変更のみで可能 |
| 外部Cron（cron-job.org）でスケジューリング | アプリ内にスケジューラデーモンを持たないことでアーキテクチャを単純化。無料枠で最短1分間隔・3ジョブまで利用可能 |
| Slack Block Kit形式 | 構造化されたリッチメッセージにより、売上サマリ・上位商品・在庫アラートを視覚的に分離して表示 |
| サービス層の3ファイル分離 | report-generator / scheduler / slack-sender を独立させることで、テスト容易性と送信先追加時の拡張性を確保 |
| React Context + localStorageによるi18n | 軽量な実装で日英切替を実現。サーバー側翻訳ライブラリの追加依存なし |
| 30分のドリフト許容 | cron-job.orgの実行タイミングのズレを吸収。厳密な時刻一致では実行漏れが発生するため |
| 連携期間（validFrom/validUntil） | レポートの有効期間を設定可能にし、キャンペーン期間限定レポート等のユースケースに対応。期間終了後もデータを保持し再開可能 |

---

## 運用コスト

| サービス | プラン | 月額 |
|----------|--------|------|
| Shopify | 開発ストア（Dev Store） | 無料 |
| cron-job.org | 無料枠（3ジョブ、最短1分間隔） | $0 |
| Slack Incoming Webhooks | 無料 | $0 |
| ホスティング（Docker） | 要選定（Heroku / AWS / Fly.io等） | 環境依存 |
| **合計（開発環境）** | | **$0** |

---

## 作者

[@mer-prog](https://github.com/mer-prog)
