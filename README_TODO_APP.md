# Supabase Todo アプリケーション

Supabaseを使用したシンプルなTodoリストアプリです。

## セットアップ手順

### 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com) にアクセスしてプロジェクトを作成
2. プロジェクトの Settings > API から以下を取得：
   - Project URL
   - anon public key

### 2. 環境変数の設定

`.env.local` ファイルに以下を設定：

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. データベースのセットアップ

Supabaseダッシュボードの SQL Editor で `supabase/schema.sql` の内容を実行

### 4. Google OAuth の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID を作成
   - Application type: Web application
   - Authorized redirect URIs: `https://[YOUR-PROJECT-REF].supabase.co/auth/v1/callback`
3. Supabaseダッシュボード > Authentication > Providers > Google を有効化
4. Google Client ID と Client Secret を Supabase に設定

### 5. アプリケーションの起動

```bash
npm install
npm run dev
```

## 機能

- Google OAuth によるログイン/ログアウト
- Todoの作成、完了/未完了の切り替え、削除
- ユーザーごとのデータ分離（RLS使用）

## 技術スタック

- Next.js 15.4.5
- Supabase (認証、データベース)
- TypeScript
- Tailwind CSS