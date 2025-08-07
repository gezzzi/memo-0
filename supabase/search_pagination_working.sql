-- 全文検索とページネーション機能のためのスキーマ（エラー修正版）

-- ============================================
-- 1. 必要な拡張機能を有効化
-- ============================================

-- pg_trgm拡張を有効化（類似度検索用）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 2. 検索用インデックスの作成
-- ============================================

-- タイトルの検索インデックス（pg_trgmを使用）
CREATE INDEX IF NOT EXISTS idx_todos_title_trgm 
ON todos USING gin (title gin_trgm_ops);

-- カテゴリー名の検索インデックス
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm 
ON categories USING gin (name gin_trgm_ops);

-- 作成日時のインデックス（ページネーション用）
CREATE INDEX IF NOT EXISTS idx_todos_created_at_desc 
ON todos (created_at DESC);

-- 複合インデックス（ユーザーID + 作成日時）
CREATE INDEX IF NOT EXISTS idx_todos_user_created 
ON todos (user_id, created_at DESC);

-- 複合インデックス（ユーザーID + 完了状態）
CREATE INDEX IF NOT EXISTS idx_todos_user_complete 
ON todos (user_id, is_complete);

-- ============================================
-- 3. 日本語対応の検索関数（シンプル版）
-- ============================================
CREATE OR REPLACE FUNCTION search_todos(
  p_user_id UUID,
  p_search_query TEXT,
  p_category_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  id UUID,
  title TEXT,
  is_complete BOOLEAN,
  category_id UUID,
  created_at TIMESTAMPTZ,
  version INTEGER,
  category_name TEXT,
  category_color TEXT,
  rank FLOAT
) AS $$
DECLARE
  v_search_query TEXT;
BEGIN
  -- 検索クエリの正規化（空白削除、小文字化）
  v_search_query := LOWER(TRIM(COALESCE(p_search_query, '')));

  RETURN QUERY
  SELECT 
    t.id,
    t.title,
    t.is_complete,
    t.category_id,
    t.created_at,
    t.version,
    c.name as category_name,
    c.color as category_color,
    -- 検索スコア（類似度）
    CASE 
      WHEN v_search_query != ''
      THEN 
        CASE
          -- 完全一致
          WHEN LOWER(t.title) = v_search_query THEN 1.0
          -- 前方一致
          WHEN LOWER(t.title) LIKE v_search_query || '%' THEN 0.8
          -- 部分一致
          WHEN LOWER(t.title) LIKE '%' || v_search_query || '%' THEN 0.6
          -- 類似度マッチ
          ELSE similarity(LOWER(t.title), v_search_query)
        END
      ELSE 0
    END::FLOAT as rank
  FROM todos t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.user_id = p_user_id
    AND (
      v_search_query = '' 
      OR LOWER(t.title) LIKE '%' || v_search_query || '%'
      OR similarity(LOWER(t.title), v_search_query) > 0.2
    )
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
  ORDER BY 
    CASE 
      WHEN v_search_query != ''
      THEN 
        CASE
          WHEN LOWER(t.title) = v_search_query THEN 1.0
          WHEN LOWER(t.title) LIKE v_search_query || '%' THEN 0.8
          WHEN LOWER(t.title) LIKE '%' || v_search_query || '%' THEN 0.6
          ELSE similarity(LOWER(t.title), v_search_query)
        END
      ELSE 0
    END DESC,
    t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. カーソルベースページネーション（効率的）
-- ============================================
CREATE OR REPLACE FUNCTION get_todos_cursor(
  p_user_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_search_query TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL
) RETURNS TABLE(
  id UUID,
  title TEXT,
  is_complete BOOLEAN,
  category_id UUID,
  created_at TIMESTAMPTZ,
  version INTEGER,
  category_name TEXT,
  category_color TEXT,
  has_more BOOLEAN
) AS $$
DECLARE
  v_search_query TEXT;
BEGIN
  -- 検索クエリの正規化
  v_search_query := LOWER(TRIM(COALESCE(p_search_query, '')));
  
  -- カーソルが指定されていない場合は最新から
  IF p_cursor IS NULL THEN
    p_cursor := NOW() + INTERVAL '1 day';
  END IF;

  -- データ取得（+1件多く取得してhas_moreを判定）
  RETURN QUERY
  WITH fetched_todos AS (
    SELECT 
      t.id,
      t.title,
      t.is_complete,
      t.category_id,
      t.created_at,
      t.version,
      c.name as category_name,
      c.color as category_color
    FROM todos t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = p_user_id
      AND t.created_at < p_cursor
      AND (
        v_search_query = '' 
        OR LOWER(t.title) LIKE '%' || v_search_query || '%'
        OR similarity(LOWER(t.title), v_search_query) > 0.2
      )
      AND (p_category_id IS NULL OR t.category_id = p_category_id)
    ORDER BY t.created_at DESC
    LIMIT p_limit + 1
  ),
  limited_todos AS (
    SELECT * FROM fetched_todos
    LIMIT p_limit
  )
  SELECT 
    lt.*,
    (SELECT COUNT(*) FROM fetched_todos) > p_limit as has_more
  FROM limited_todos lt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. 検索候補の取得（オートコンプリート用）
-- ============================================
CREATE OR REPLACE FUNCTION get_search_suggestions(
  p_user_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 5
) RETURNS TABLE(
  suggestion TEXT,
  count INTEGER
) AS $$
DECLARE
  v_query TEXT;
BEGIN
  v_query := LOWER(TRIM(COALESCE(p_query, '')));
  
  IF v_query = '' THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    CASE 
      WHEN LENGTH(title) > 50 
      THEN SUBSTRING(title FROM 1 FOR 47) || '...'
      ELSE title
    END as suggestion,
    COUNT(*)::INTEGER as count
  FROM todos
  WHERE user_id = p_user_id
    AND LOWER(title) LIKE v_query || '%'
  GROUP BY 
    CASE 
      WHEN LENGTH(title) > 50 
      THEN SUBSTRING(title FROM 1 FOR 47) || '...'
      ELSE title
    END
  ORDER BY count DESC, suggestion
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. ページネーション情報の取得
-- ============================================
CREATE OR REPLACE FUNCTION get_pagination_info(
  p_user_id UUID,
  p_search_query TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL
) RETURNS TABLE(
  total_count INTEGER,
  total_pages INTEGER,
  items_per_page INTEGER
) AS $$
DECLARE
  v_total_count INTEGER;
  v_items_per_page INTEGER := 20;
  v_search_query TEXT;
BEGIN
  v_search_query := LOWER(TRIM(COALESCE(p_search_query, '')));
  
  SELECT COUNT(*)::INTEGER INTO v_total_count
  FROM todos
  WHERE user_id = p_user_id
    AND (
      v_search_query = '' 
      OR LOWER(title) LIKE '%' || v_search_query || '%'
      OR similarity(LOWER(title), v_search_query) > 0.2
    )
    AND (p_category_id IS NULL OR category_id = p_category_id);

  RETURN QUERY
  SELECT 
    v_total_count,
    CEIL(v_total_count::FLOAT / v_items_per_page)::INTEGER,
    v_items_per_page;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. 高度な検索（複数キーワード対応）
-- ============================================
CREATE OR REPLACE FUNCTION search_todos_advanced(
  p_user_id UUID,
  p_search_query TEXT,
  p_category_id UUID DEFAULT NULL,
  p_is_complete BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
  id UUID,
  title TEXT,
  is_complete BOOLEAN,
  category_id UUID,
  created_at TIMESTAMPTZ,
  version INTEGER,
  category_name TEXT,
  category_color TEXT,
  rank FLOAT
) AS $$
DECLARE
  v_search_terms TEXT[];
  v_search_query TEXT;
BEGIN
  -- 検索クエリの正規化とスペース区切り
  v_search_query := LOWER(TRIM(COALESCE(p_search_query, '')));
  
  -- スペースで分割（複数キーワード検索）
  IF v_search_query != '' THEN
    v_search_terms := string_to_array(v_search_query, ' ');
  ELSE
    v_search_terms := ARRAY[]::TEXT[];
  END IF;

  RETURN QUERY
  SELECT 
    t.id,
    t.title,
    t.is_complete,
    t.category_id,
    t.created_at,
    t.version,
    c.name as category_name,
    c.color as category_color,
    -- マッチしたキーワード数をスコアとする
    (
      SELECT COUNT(*)::FLOAT / GREATEST(array_length(v_search_terms, 1), 1)
      FROM unnest(v_search_terms) AS term
      WHERE LOWER(t.title) LIKE '%' || term || '%'
    ) as rank
  FROM todos t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.user_id = p_user_id
    AND (p_category_id IS NULL OR t.category_id = p_category_id)
    AND (p_is_complete IS NULL OR t.is_complete = p_is_complete)
    AND (
      array_length(v_search_terms, 1) IS NULL
      OR array_length(v_search_terms, 1) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(v_search_terms) AS term
        WHERE LOWER(t.title) LIKE '%' || term || '%'
      )
    )
  ORDER BY 
    -- マッチしたキーワード数でソート
    (
      SELECT COUNT(*)::FLOAT / GREATEST(array_length(v_search_terms, 1), 1)
      FROM unnest(v_search_terms) AS term
      WHERE LOWER(t.title) LIKE '%' || term || '%'
    ) DESC,
    t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. テーブルの統計情報を更新（パフォーマンス最適化）
-- ============================================
ANALYZE todos;
ANALYZE categories;

-- ============================================
-- 完了メッセージ
-- ============================================
-- 全文検索とページネーション機能のセットアップが完了しました！
-- 
-- 使用可能な関数:
-- - search_todos: 基本的な検索機能
-- - get_todos_cursor: カーソルベースのページネーション
-- - get_search_suggestions: 検索候補の取得
-- - get_pagination_info: ページ情報の取得
-- - search_todos_advanced: 高度な検索（複数キーワード対応）