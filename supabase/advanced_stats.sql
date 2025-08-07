-- 高度な統計用のビューとクエリ例
-- これらはSupabaseのSQL Editorで実行することで、より効率的な集計が可能になります

-- ============================================
-- 1. カテゴリー別統計ビュー（GROUP BYの実例）
-- ============================================
CREATE OR REPLACE VIEW category_stats AS
SELECT 
  c.id as category_id,
  c.name as category_name,
  c.color as category_color,
  c.user_id,
  COUNT(t.id) as total_todos,
  COUNT(CASE WHEN t.is_complete = true THEN 1 END) as completed_todos,
  COUNT(CASE WHEN t.is_complete = false THEN 1 END) as pending_todos,
  CASE 
    WHEN COUNT(t.id) > 0 
    THEN ROUND(COUNT(CASE WHEN t.is_complete = true THEN 1 END)::numeric / COUNT(t.id) * 100, 2)
    ELSE 0
  END as completion_rate
FROM categories c
LEFT JOIN todos t ON c.id = t.category_id
GROUP BY c.id, c.name, c.color, c.user_id
ORDER BY total_todos DESC;

-- ============================================
-- 2. ユーザー別の全体統計ビュー（集計関数の組み合わせ）
-- ============================================
CREATE OR REPLACE VIEW user_stats AS
SELECT 
  t.user_id,
  COUNT(DISTINCT t.id) as total_todos,
  COUNT(DISTINCT CASE WHEN t.is_complete = true THEN t.id END) as completed_todos,
  COUNT(DISTINCT t.category_id) as categories_used,
  ROUND(
    COUNT(CASE WHEN t.is_complete = true THEN 1 END)::numeric / 
    NULLIF(COUNT(t.id), 0) * 100, 
    2
  ) as overall_completion_rate,
  MIN(t.created_at) as first_todo_date,
  MAX(t.created_at) as last_todo_date
FROM todos t
GROUP BY t.user_id;

-- ============================================
-- 3. 時系列統計（ウィンドウ関数の例）
-- ============================================
CREATE OR REPLACE VIEW daily_stats AS
SELECT 
  user_id,
  DATE(created_at) as todo_date,
  COUNT(*) as todos_created,
  SUM(CASE WHEN is_complete THEN 1 ELSE 0 END) as todos_completed,
  -- 累積カウント（ウィンドウ関数）
  SUM(COUNT(*)) OVER (
    PARTITION BY user_id 
    ORDER BY DATE(created_at)
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) as cumulative_todos,
  -- 7日間の移動平均
  AVG(COUNT(*)) OVER (
    PARTITION BY user_id 
    ORDER BY DATE(created_at)
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as moving_avg_7days
FROM todos
GROUP BY user_id, DATE(created_at);

-- ============================================
-- 4. カテゴリーランキング（RANK関数の例）
-- ============================================
CREATE OR REPLACE VIEW category_rankings AS
SELECT 
  user_id,
  category_id,
  category_name,
  total_todos,
  completion_rate,
  RANK() OVER (PARTITION BY user_id ORDER BY total_todos DESC) as usage_rank,
  RANK() OVER (PARTITION BY user_id ORDER BY completion_rate DESC) as completion_rank,
  DENSE_RANK() OVER (PARTITION BY user_id ORDER BY total_todos DESC) as dense_usage_rank
FROM (
  SELECT 
    c.user_id,
    c.id as category_id,
    c.name as category_name,
    COUNT(t.id) as total_todos,
    CASE 
      WHEN COUNT(t.id) > 0 
      THEN ROUND(COUNT(CASE WHEN t.is_complete = true THEN 1 END)::numeric / COUNT(t.id) * 100, 2)
      ELSE 0
    END as completion_rate
  FROM categories c
  LEFT JOIN todos t ON c.id = t.category_id
  GROUP BY c.user_id, c.id, c.name
) as category_counts;

-- ============================================
-- 5. サブクエリの例：平均以上の完了率を持つカテゴリー
-- ============================================
CREATE OR REPLACE VIEW high_performing_categories AS
SELECT 
  cs.*
FROM category_stats cs
WHERE cs.completion_rate > (
  -- サブクエリ：全カテゴリーの平均完了率を計算
  SELECT AVG(completion_rate)
  FROM category_stats
  WHERE user_id = cs.user_id AND total_todos > 0
);

-- ============================================
-- 6. WITH句（CTE）を使った複雑な集計の例
-- ============================================
CREATE OR REPLACE VIEW comprehensive_stats AS
WITH category_summary AS (
  SELECT 
    user_id,
    category_id,
    COUNT(*) as todo_count,
    SUM(CASE WHEN is_complete THEN 1 ELSE 0 END) as completed_count
  FROM todos
  GROUP BY user_id, category_id
),
user_summary AS (
  SELECT 
    user_id,
    COUNT(*) as total_todos,
    SUM(CASE WHEN is_complete THEN 1 ELSE 0 END) as total_completed
  FROM todos
  GROUP BY user_id
)
SELECT 
  u.user_id,
  u.total_todos,
  u.total_completed,
  ROUND(u.total_completed::numeric / NULLIF(u.total_todos, 0) * 100, 2) as completion_rate,
  COUNT(DISTINCT cs.category_id) as categories_used,
  MAX(cs.todo_count) as max_todos_in_category,
  MIN(cs.todo_count) as min_todos_in_category,
  AVG(cs.todo_count)::numeric(10,2) as avg_todos_per_category
FROM user_summary u
LEFT JOIN category_summary cs ON u.user_id = cs.user_id
GROUP BY u.user_id, u.total_todos, u.total_completed;

-- ============================================
-- 7. 実行プランの確認（パフォーマンス最適化の練習）
-- ============================================
-- 以下のコマンドで実行プランを確認できます：
-- EXPLAIN ANALYZE SELECT * FROM category_stats WHERE user_id = 'YOUR_USER_ID';

-- ============================================
-- 8. 関数の例：特定期間の完了率を計算
-- ============================================
CREATE OR REPLACE FUNCTION get_completion_rate_for_period(
  p_user_id UUID,
  p_start_date TIMESTAMP,
  p_end_date TIMESTAMP
) RETURNS TABLE(
  total_todos INT,
  completed_todos INT,
  completion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INT as total_todos,
    COUNT(CASE WHEN is_complete THEN 1 END)::INT as completed_todos,
    ROUND(
      COUNT(CASE WHEN is_complete THEN 1 END)::numeric / 
      NULLIF(COUNT(*), 0) * 100, 
      2
    ) as completion_rate
  FROM todos
  WHERE user_id = p_user_id
    AND created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- 使用例：
-- SELECT * FROM get_completion_rate_for_period(
--   'user-uuid-here',
--   '2024-01-01'::timestamp,
--   '2024-12-31'::timestamp
-- );