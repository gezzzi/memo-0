-- トランザクション処理と楽観的ロックのためのスキーマ更新（修正版）

-- ============================================
-- 1. todosテーブルにversion列を追加（楽観的ロック用）
-- ============================================
ALTER TABLE todos 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

ALTER TABLE todos
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

-- ============================================
-- 2. バージョン更新トリガー
-- ============================================
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_todo_version ON todos;
CREATE TRIGGER update_todo_version
  BEFORE UPDATE ON todos
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- ============================================
-- 3. トランザクション処理用の関数（修正版）
-- ============================================

-- 複数Todoの一括完了/未完了（トランザクション保証）
CREATE OR REPLACE FUNCTION bulk_update_todos(
  p_user_id UUID,
  p_todo_ids UUID[],
  p_is_complete BOOLEAN
) RETURNS TABLE(
  success BOOLEAN,
  updated_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_row_count INTEGER;
  v_todo_id UUID;
BEGIN
  -- トランザクション開始（関数内は自動的にトランザクション）
  
  -- 各TodoのIDをループ処理
  FOREACH v_todo_id IN ARRAY p_todo_ids
  LOOP
    -- ユーザー権限チェックと更新を同時に実行
    UPDATE todos 
    SET is_complete = p_is_complete
    WHERE id = v_todo_id 
      AND user_id = p_user_id;
    
    -- 更新された行数を取得
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_updated_count := v_updated_count + v_row_count;
  END LOOP;
  
  -- 期待した数の更新が行われなかった場合はロールバック
  IF v_updated_count != array_length(p_todo_ids, 1) THEN
    RAISE EXCEPTION 'Some todos could not be updated. Expected: %, Updated: %', 
      array_length(p_todo_ids, 1), v_updated_count;
  END IF;
  
  -- 成功を返す
  RETURN QUERY SELECT true, v_updated_count, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    -- エラー発生時は自動的にロールバック
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. カテゴリー一括変更（トランザクション保証）
-- ============================================
CREATE OR REPLACE FUNCTION bulk_change_category(
  p_user_id UUID,
  p_todo_ids UUID[],
  p_category_id UUID
) RETURNS TABLE(
  success BOOLEAN,
  updated_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_category_exists BOOLEAN;
BEGIN
  -- カテゴリーの存在確認（NULLの場合はスキップ）
  IF p_category_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM categories 
      WHERE id = p_category_id AND user_id = p_user_id
    ) INTO v_category_exists;
    
    IF NOT v_category_exists THEN
      RAISE EXCEPTION 'Category does not exist or access denied';
    END IF;
  END IF;
  
  -- 一括更新
  UPDATE todos 
  SET category_id = p_category_id
  WHERE id = ANY(p_todo_ids) 
    AND user_id = p_user_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  IF v_updated_count != array_length(p_todo_ids, 1) THEN
    RAISE EXCEPTION 'Some todos could not be updated';
  END IF;
  
  RETURN QUERY SELECT true, v_updated_count, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. 楽観的ロックを使った更新
-- ============================================
CREATE OR REPLACE FUNCTION update_todo_with_version(
  p_user_id UUID,
  p_todo_id UUID,
  p_title TEXT,
  p_is_complete BOOLEAN,
  p_category_id UUID,
  p_expected_version INTEGER
) RETURNS TABLE(
  success BOOLEAN,
  new_version INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_updated_count INTEGER;
  v_new_version INTEGER;
BEGIN
  -- バージョンチェック付きで更新
  UPDATE todos 
  SET 
    title = p_title,
    is_complete = p_is_complete,
    category_id = p_category_id
  WHERE id = p_todo_id 
    AND user_id = p_user_id
    AND version = p_expected_version
  RETURNING version INTO v_new_version;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  IF v_updated_count = 0 THEN
    -- 更新できなかった理由を特定
    IF NOT EXISTS(SELECT 1 FROM todos WHERE id = p_todo_id AND user_id = p_user_id) THEN
      RAISE EXCEPTION 'Todo not found or access denied';
    ELSE
      RAISE EXCEPTION 'Version conflict: Todo was modified by another process';
    END IF;
  END IF;
  
  RETURN QUERY SELECT true, v_new_version, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. 一括削除（トランザクション保証）
-- ============================================
CREATE OR REPLACE FUNCTION bulk_delete_todos(
  p_user_id UUID,
  p_todo_ids UUID[]
) RETURNS TABLE(
  success BOOLEAN,
  deleted_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- 削除実行
  DELETE FROM todos 
  WHERE id = ANY(p_todo_ids) 
    AND user_id = p_user_id;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- 全て削除できたか確認
  IF v_deleted_count != array_length(p_todo_ids, 1) THEN
    RAISE EXCEPTION 'Some todos could not be deleted. Expected: %, Deleted: %',
      array_length(p_todo_ids, 1), v_deleted_count;
  END IF;
  
  RETURN QUERY SELECT true, v_deleted_count, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. デッドロック対策：順序付き更新
-- ============================================
CREATE OR REPLACE FUNCTION bulk_update_todos_ordered(
  p_user_id UUID,
  p_todo_ids UUID[],
  p_is_complete BOOLEAN
) RETURNS TABLE(
  success BOOLEAN,
  updated_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- IDでソートしてからロックすることでデッドロックを防ぐ
  UPDATE todos 
  SET is_complete = p_is_complete
  WHERE id IN (
    SELECT id FROM todos 
    WHERE id = ANY(p_todo_ids) AND user_id = p_user_id
    ORDER BY id  -- 順序を固定してデッドロック防止
    FOR UPDATE   -- 明示的にロック
  );
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  IF v_updated_count != array_length(p_todo_ids, 1) THEN
    RAISE EXCEPTION 'Update failed';
  END IF;
  
  RETURN QUERY SELECT true, v_updated_count, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. より効率的な一括更新（単一クエリ版）
-- ============================================
CREATE OR REPLACE FUNCTION bulk_update_todos_efficient(
  p_user_id UUID,
  p_todo_ids UUID[],
  p_is_complete BOOLEAN
) RETURNS TABLE(
  success BOOLEAN,
  updated_count INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- 単一のUPDATE文で一括更新（より効率的）
  UPDATE todos 
  SET is_complete = p_is_complete
  WHERE id = ANY(p_todo_ids) 
    AND user_id = p_user_id;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- 期待した数の更新が行われなかった場合はロールバック
  IF v_updated_count != array_length(p_todo_ids, 1) THEN
    RAISE EXCEPTION 'Some todos could not be updated. Expected: %, Updated: %', 
      array_length(p_todo_ids, 1), v_updated_count;
  END IF;
  
  RETURN QUERY SELECT true, v_updated_count, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;