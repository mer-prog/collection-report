# CollectionReport — コレクションレポート自動送信アプリ

## プロジェクト概要

Upworkポートフォリオ用のShopify Embedded App。
特定コレクションの売上・在庫データを定期集計し、Slackに自動送信する。

**ターゲット:** 中〜大規模マーチャント / 運用チーム
**Dev Store:** ryo-dev-plus（Shopify Plus Dev Store）

## 技術スタック

- Remix（Shopify App Template）
- TypeScript
- Prisma + SQLite（セッション管理・アプリデータ）
- Polaris React（管理画面UI）
- GraphQL Admin API
- Shopify App Bridge
- Slack Incoming Webhook

## 必要なAPIスコープ

read_products, read_orders, read_inventory

## ディレクトリ構成

collection-report/
├── CLAUDE.md
├── app/
│   ├── routes/
│   │   ├── app._index.tsx          # レポート設定ダッシュボード
│   │   ├── app.reports.new.tsx     # 新規レポート作成
│   │   ├── app.reports.$id.tsx     # レポート詳細・編集
│   │   ├── app.reports.$id.preview.tsx  # レポートプレビュー
│   │   ├── api.cron.tsx            # Cronエンドポイント
│   │   └── webhooks.tsx            # Shopify Webhook受信
│   ├── services/
│   │   ├── report-generator.server.ts   # データ集計ロジック
│   │   ├── slack-sender.server.ts       # Slack Webhook送信
│   │   └── scheduler.server.ts          # スケジュール判定ロジック
│   ├── components/
│   │   ├── ReportConfigForm.tsx     # レポート設定フォーム
│   │   ├── CollectionPicker.tsx     # コレクション選択UI
│   │   ├── ScheduleSelector.tsx     # 送信スケジュール設定
│   │   └── ReportPreview.tsx        # レポートプレビュー
│   └── shopify.server.ts
├── prisma/
│   └── schema.prisma
├── shopify.app.toml
└── package.json

## 画面構成

### ダッシュボード（app._index.tsx）
- 設定済みレポート一覧（コレクション名、送信先、スケジュール、連携期間、最終送信日時）
- ステータスバッジ: 「稼働中」「開始待ち」「期間終了」「無効」
- 「新規レポート作成」ボタン
- 各レポートに「今すぐ送信」「編集」「削除」アクション

### レポート作成（app.reports.new.tsx）
1. コレクション選択（Shopify ResourcePicker）
2. レポート項目選択（売上合計、注文件数、在庫数、売上上位商品）
3. 送信先設定（Slack Webhook URL）
4. スケジュール設定:
   - 頻度: 日次/週次/月次
   - 曜日（週次の場合）
   - 日付（月次の場合）
   - 送信時刻
   - 連携開始日（任意）
   - 連携終了日（任意）

### レポートプレビュー（app.reports.$id.preview.tsx）
- Slack Block Kit形式のプレビュー表示

## レポートデータ仕様

interface CollectionReportData {
  collectionTitle: string;
  period: { from: string; to: string };
  summary: {
    totalRevenue: number;
    totalOrders: number;
    totalUnitsSold: number;
    averageOrderValue: number;
  };
  topProducts: Array<{
    title: string;
    unitsSold: number;
    revenue: number;
    currentInventory: number;
  }>;
  lowStockProducts: Array<{
    title: string;
    currentInventory: number;
    variantTitle: string;
  }>;
}

## Slack送信フォーマット（Block Kit）

ヘッダー: コレクションレポート: {collectionTitle}
セクション: 期間、売上合計、注文件数、平均注文額
区切り線
セクション: 売上上位商品（1〜3位）
セクション: 在庫少商品リスト

## 定期実行の仕組み（MVP）

cron-job.org（無料枠）から POST /api/cron を定期呼び出し。
リクエスト時にBearerトークンで認証。

フロー:
cron-job.org -> POST /api/cron
  -> 全アクティブなReportConfigを取得
  -> 各configに対して:
    1. isActive === true
    2. validFrom <= now（未設定なら通過）
    3. validUntil >= now（未設定なら通過）
    4. scheduleに基づく実行タイミング判定
  -> 条件を満たすconfigのみレポート生成 -> Slack送信

連携期間終了時の挙動:
- validUntilを過ぎたレポートは自動スキップ（削除しない）
- ダッシュボードに「期間終了」バッジ表示
- 再開したい場合はvalidUntilを延長するだけ

## Prismaスキーマ（追加分）

model ReportConfig {
  id              String   @id @default(cuid())
  shop            String
  collectionId    String
  collectionTitle String
  schedule        String   // daily|weekly|monthly
  scheduleTime    String   // "09:00"
  scheduleDay     Int?     // 週: 0-6, 月: 1-31
  slackWebhookUrl String?
  isActive        Boolean  @default(true)
  validFrom       DateTime?
  validUntil      DateTime?
  lastSentAt      DateTime?
  createdAt       DateTime @default(now())
  reports         ReportLog[]
}

model ReportLog {
  id          String   @id @default(cuid())
  configId    String
  config      ReportConfig @relation(fields: [configId], references: [id])
  status      String   // success | failed
  sentTo      String   // slack
  errorMsg    String?
  createdAt   DateTime @default(now())
}

## コーディング規約

- TypeScript strict mode
- Polaris React コンポーネント使用（カスタムCSS最小限）
- サービスロジックは *.server.ts に分離
- Conventional Commits形式

## テスト方針

- MVPでは手動テスト
- 「今すぐ送信」ボタンでSlack送信の動作確認
- レポートプレビューで集計データの確認

## MVPスコープ

含む:
- コレクション選択 -> レポート生成 -> Slack送信
- 「今すぐ送信」ボタン
- レポートプレビュー
- Cronエンドポイント（定期実行対応）
- 連携期間設定（validFrom / validUntil）
- ステータスバッジ表示

含まない（来週以降）:
- Google Sheets連携（OAuth設定が重い）
- レポートのカスタムテンプレート
- PDF出力

## コスト

- Slack Webhook: 無料
- cron-job.org: 無料枠（最短1分間隔、3ジョブまで）

## 開発コマンド

shopify app dev
shopify app deploy
