'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

type CategoryStats = {
  category_id: string | null
  category_name: string | null
  category_color: string | null
  total_count: number
  completed_count: number
  completion_rate: number
}

type OverallStats = {
  total_todos: number
  completed_todos: number
  pending_todos: number
  total_categories: number
  completion_rate: number
  most_used_category: string | null
  least_used_category: string | null
}

export default function StatsDashboard({ user }: { user: User | null }) {
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([])
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'all' | 'week' | 'month'>('all')
  
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      fetchStats()
    } else {
      setLoading(false)
    }
  }, [user, timeRange])

  const fetchStats = async () => {
    setLoading(true)

    // 日付フィルターの設定
    let dateFilter = ''
    const now = new Date()
    if (timeRange === 'week') {
      const weekAgo = new Date(now.setDate(now.getDate() - 7))
      dateFilter = weekAgo.toISOString()
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1))
      dateFilter = monthAgo.toISOString()
    }

    // カテゴリー別統計を取得（GROUP BY使用）
    // Supabaseでは直接的な集計クエリが制限されるため、データを取得してから集計
    const todosQuery = supabase
      .from('todos')
      .select(`
        id,
        is_complete,
        category_id,
        created_at,
        category:categories(
          id,
          name,
          color
        )
      `)
      .order('created_at', { ascending: false })

    if (dateFilter) {
      todosQuery.gte('created_at', dateFilter)
    }

    const { data: todos, error: todosError } = await todosQuery

    if (todosError) {
      console.error('Error fetching todos:', todosError)
      setLoading(false)
      return
    }

    // カテゴリーデータを取得
    const { data: categories } = await supabase
      .from('categories')
      .select('*')

    // データを集計（JavaScriptでGROUP BY相当の処理）
    const statsMap = new Map<string | null, CategoryStats>()

    // 未分類カテゴリーの初期化
    statsMap.set(null, {
      category_id: null,
      category_name: '未分類',
      category_color: '#6B7280',
      total_count: 0,
      completed_count: 0,
      completion_rate: 0
    })

    // 各カテゴリーの初期化
    categories?.forEach(cat => {
      statsMap.set(cat.id, {
        category_id: cat.id,
        category_name: cat.name,
        category_color: cat.color,
        total_count: 0,
        completed_count: 0,
        completion_rate: 0
      })
    })

    // Todosを集計
    todos?.forEach(todo => {
      const categoryId = todo.category_id
      const stats = statsMap.get(categoryId)
      
      if (stats) {
        stats.total_count++
        if (todo.is_complete) {
          stats.completed_count++
        }
      }
    })

    // 完了率を計算
    statsMap.forEach(stats => {
      if (stats.total_count > 0) {
        stats.completion_rate = Math.round((stats.completed_count / stats.total_count) * 100)
      }
    })

    // 配列に変換してソート（Todo数が多い順）
    const categoryStatsArray = Array.from(statsMap.values())
      .filter(stat => stat.total_count > 0) // Todoがあるカテゴリーのみ
      .sort((a, b) => b.total_count - a.total_count)

    setCategoryStats(categoryStatsArray)

    // 全体統計を計算
    const totalTodos = todos?.length || 0
    const completedTodos = todos?.filter(t => t.is_complete).length || 0
    const pendingTodos = totalTodos - completedTodos
    const completionRate = totalTodos > 0 
      ? Math.round((completedTodos / totalTodos) * 100)
      : 0

    // 最も使われているカテゴリーと最も使われていないカテゴリーを特定
    const categoriesWithTodos = categoryStatsArray.filter(s => s.category_id !== null)
    const mostUsed = categoriesWithTodos.length > 0 ? categoriesWithTodos[0].category_name : null
    const leastUsed = categoriesWithTodos.length > 0 
      ? categoriesWithTodos[categoriesWithTodos.length - 1].category_name 
      : null

    setOverallStats({
      total_todos: totalTodos,
      completed_todos: completedTodos,
      pending_todos: pendingTodos,
      total_categories: categories?.length || 0,
      completion_rate: completionRate,
      most_used_category: mostUsed,
      least_used_category: leastUsed
    })

    setLoading(false)
  }

  if (!user) {
    return null
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="text-center text-gray-400">統計を読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-100">統計ダッシュボード</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setTimeRange('all')}
            className={`px-3 py-1 text-xs rounded-md transition ${
              timeRange === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            全期間
          </button>
          <button
            onClick={() => setTimeRange('week')}
            className={`px-3 py-1 text-xs rounded-md transition ${
              timeRange === 'week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            過去7日
          </button>
          <button
            onClick={() => setTimeRange('month')}
            className={`px-3 py-1 text-xs rounded-md transition ${
              timeRange === 'month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            過去30日
          </button>
        </div>
      </div>

      {/* 全体統計 */}
      {overallStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-400">全Todo</div>
            <div className="text-2xl font-bold text-gray-100">{overallStats.total_todos}</div>
          </div>
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-400">完了</div>
            <div className="text-2xl font-bold text-green-400">{overallStats.completed_todos}</div>
          </div>
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-400">未完了</div>
            <div className="text-2xl font-bold text-yellow-400">{overallStats.pending_todos}</div>
          </div>
          <div className="bg-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-400">完了率</div>
            <div className="text-2xl font-bold text-blue-400">{overallStats.completion_rate}%</div>
          </div>
        </div>
      )}

      {/* カテゴリー別統計 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">カテゴリー別完了率</h3>
        <div className="space-y-3">
          {categoryStats.map((stat) => (
            <div key={stat.category_id || 'uncategorized'} className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stat.category_color || '#6B7280' }}
                  />
                  <span className="text-gray-300">{stat.category_name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-400">
                    {stat.completed_count}/{stat.total_count}
                  </span>
                  <span className="text-gray-100 font-semibold w-12 text-right">
                    {stat.completion_rate}%
                  </span>
                </div>
              </div>
              <div className="relative w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full transition-all duration-500 rounded-full"
                  style={{
                    width: `${stat.completion_rate}%`,
                    backgroundColor: stat.category_color || '#6B7280'
                  }}
                />
              </div>
            </div>
          ))}
          {categoryStats.length === 0 && (
            <p className="text-center text-gray-500 py-4">
              データがありません
            </p>
          )}
        </div>
      </div>

      {/* 追加の洞察 */}
      {overallStats && overallStats.total_todos > 0 && (
        <div className="border-t border-gray-700 pt-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">洞察</h3>
          <div className="space-y-1 text-xs text-gray-400">
            {overallStats.most_used_category && (
              <p>• 最も使用: <span className="text-gray-200">{overallStats.most_used_category}</span></p>
            )}
            {overallStats.least_used_category && overallStats.most_used_category !== overallStats.least_used_category && (
              <p>• 最も未使用: <span className="text-gray-200">{overallStats.least_used_category}</span></p>
            )}
            <p>• カテゴリー数: <span className="text-gray-200">{overallStats.total_categories}</span></p>
          </div>
        </div>
      )}
    </div>
  )
}