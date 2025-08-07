'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import type { Category, TodoWithCategory } from '@/types/database'
import { 
  bulkUpdateTodos, 
  bulkChangeCategory, 
  bulkDeleteTodos,
  TransactionError 
} from '@/lib/api/transactions'

// 拡張版のTodo型（バージョン管理付き）
type TodoWithVersion = TodoWithCategory & {
  version?: number
  updated_at?: string
}

export default function TodoListWithTransactions({ user }: { user: User | null }) {
  const [todos, setTodos] = useState<TodoWithVersion[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedTodos, setSelectedTodos] = useState<Set<string>>(new Set())
  const [newTodo, setNewTodo] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      Promise.all([fetchTodos(), fetchCategories()])
    } else {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    // メッセージを3秒後に消す
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name')

    if (!error && data) {
      setCategories(data)
    }
  }

  const fetchTodos = async () => {
    const { data, error } = await supabase
      .from('todos')
      .select(`
        *,
        category:categories(*),
        version,
        updated_at
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTodos(data as TodoWithVersion[])
    }
    setLoading(false)
  }

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodo.trim() || !user) return

    const todoData: { title: string; user_id: string; category_id?: string } = {
      title: newTodo,
      user_id: user.id,
    }

    if (selectedCategoryId) {
      todoData.category_id = selectedCategoryId
    }

    const { data, error } = await supabase
      .from('todos')
      .insert(todoData)
      .select(`
        *,
        category:categories(*),
        version,
        updated_at
      `)
      .single()

    if (!error && data) {
      setTodos([data as TodoWithVersion, ...todos])
      setNewTodo('')
      setSuccessMessage('Todoを追加しました')
    }
  }

  const toggleTodo = async (id: string, isComplete: boolean) => {
    const { error } = await supabase
      .from('todos')
      .update({ is_complete: !isComplete })
      .eq('id', id)

    if (!error) {
      setTodos(todos.map(todo => 
        todo.id === id ? { ...todo, is_complete: !isComplete } : todo
      ))
    }
  }

  const deleteTodo = async (id: string) => {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)

    if (!error) {
      setTodos(todos.filter(todo => todo.id !== id))
      setSelectedTodos(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  // ============================================
  // 一括操作機能（トランザクション処理）
  // ============================================

  const handleSelectAll = () => {
    if (selectedTodos.size === filteredTodos.length) {
      setSelectedTodos(new Set())
    } else {
      setSelectedTodos(new Set(filteredTodos.map(t => t.id)))
    }
  }

  const handleSelectTodo = (id: string) => {
    const newSelected = new Set(selectedTodos)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedTodos(newSelected)
  }

  const handleBulkComplete = async (isComplete: boolean) => {
    if (selectedTodos.size === 0) return

    setBulkLoading(true)
    setError(null)

    try {
      const result = await bulkUpdateTodos(
        Array.from(selectedTodos),
        isComplete
      )

      if (result.success) {
        // UIを更新
        setTodos(todos.map(todo => 
          selectedTodos.has(todo.id) 
            ? { ...todo, is_complete: isComplete }
            : todo
        ))
        setSelectedTodos(new Set())
        setSuccessMessage(
          `${result.updatedCount}件のTodoを${isComplete ? '完了' : '未完了'}にしました`
        )
      }
    } catch (err) {
      if (err instanceof TransactionError) {
        if (err.code === 'VERSION_CONFLICT') {
          setError('他のユーザーによって変更されています。ページを更新してください。')
          // データを再取得
          await fetchTodos()
        } else {
          setError(err.message)
        }
      } else {
        setError('予期しないエラーが発生しました')
      }
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkChangeCategory = async (categoryId: string | null) => {
    if (selectedTodos.size === 0) return

    setBulkLoading(true)
    setError(null)

    try {
      const result = await bulkChangeCategory(
        Array.from(selectedTodos),
        categoryId
      )

      if (result.success) {
        // UIを更新
        const category = categories.find(c => c.id === categoryId) || null
        setTodos(todos.map(todo => 
          selectedTodos.has(todo.id) 
            ? { ...todo, category_id: categoryId, category }
            : todo
        ))
        setSelectedTodos(new Set())
        setSuccessMessage(`${result.updatedCount}件のカテゴリーを変更しました`)
      }
    } catch (err) {
      if (err instanceof TransactionError) {
        setError(err.message)
      } else {
        setError('カテゴリー変更に失敗しました')
      }
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedTodos.size === 0) return

    if (!confirm(`${selectedTodos.size}件のTodoを削除しますか？`)) return

    setBulkLoading(true)
    setError(null)

    try {
      const result = await bulkDeleteTodos(Array.from(selectedTodos))

      if (result.success) {
        setTodos(todos.filter(todo => !selectedTodos.has(todo.id)))
        setSelectedTodos(new Set())
        setSuccessMessage(`${result.deletedCount}件のTodoを削除しました`)
      }
    } catch (err) {
      if (err instanceof TransactionError) {
        setError(err.message)
      } else {
        setError('削除に失敗しました')
      }
    } finally {
      setBulkLoading(false)
    }
  }

  // フィルタリング
  const filteredTodos = filterCategoryId === 'all' 
    ? todos 
    : filterCategoryId === 'uncategorized'
    ? todos.filter(todo => !todo.category_id)
    : todos.filter(todo => todo.category_id === filterCategoryId)

  const getCategoryCount = (categoryId: string | null) => {
    if (categoryId === null) {
      return todos.filter(todo => !todo.category_id).length
    }
    return todos.filter(todo => todo.category_id === categoryId).length
  }

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">ログインしてTodoリストを使用してください</p>
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-300">読み込み中...</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* エラー/成功メッセージ */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 text-red-400 rounded-md border border-red-800">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-900/30 text-green-400 rounded-md border border-green-800">
          {successMessage}
        </div>
      )}

      {/* Todo追加フォーム */}
      <form onSubmit={addTodo} className="mb-6 bg-gray-800 p-4 rounded-lg">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="新しいTodoを入力"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
            >
              追加
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-gray-400 text-sm">カテゴリー:</span>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="px-3 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">なし</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {/* 一括操作モード切り替え */}
      <div className="mb-4 flex justify-between items-center">
        <button
          onClick={() => {
            setBulkMode(!bulkMode)
            setSelectedTodos(new Set())
          }}
          className={`px-4 py-2 rounded-md transition ${
            bulkMode 
              ? 'bg-yellow-600 text-white hover:bg-yellow-700' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {bulkMode ? '一括操作モード終了' : '一括操作モード'}
        </button>

        {bulkMode && selectedTodos.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkComplete(true)}
              disabled={bulkLoading}
              className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              完了にする ({selectedTodos.size})
            </button>
            <button
              onClick={() => handleBulkComplete(false)}
              disabled={bulkLoading}
              className="px-3 py-1 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            >
              未完了にする ({selectedTodos.size})
            </button>
            <select
              onChange={(e) => handleBulkChangeCategory(e.target.value || null)}
              disabled={bulkLoading}
              className="px-3 py-1 bg-gray-700 text-gray-100 rounded-md"
            >
              <option value="">カテゴリー変更...</option>
              <option value="">カテゴリーなし</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              削除 ({selectedTodos.size})
            </button>
          </div>
        )}
      </div>

      {/* フィルターバー */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategoryId('all')}
          className={`px-3 py-1 rounded-md transition ${
            filterCategoryId === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          すべて ({todos.length})
        </button>
        <button
          onClick={() => setFilterCategoryId('uncategorized')}
          className={`px-3 py-1 rounded-md transition ${
            filterCategoryId === 'uncategorized'
              ? 'bg-gray-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          未分類 ({getCategoryCount(null)})
        </button>
        {categories.map(category => (
          <button
            key={category.id}
            onClick={() => setFilterCategoryId(category.id)}
            className={`px-3 py-1 rounded-md transition flex items-center gap-2 ${
              filterCategoryId === category.id
                ? 'text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            style={{
              backgroundColor: filterCategoryId === category.id ? category.color : undefined
            }}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name} ({getCategoryCount(category.id)})
          </button>
        ))}
      </div>

      {/* 一括選択 */}
      {bulkMode && filteredTodos.length > 0 && (
        <div className="mb-2">
          <button
            onClick={handleSelectAll}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {selectedTodos.size === filteredTodos.length ? '選択解除' : 'すべて選択'}
          </button>
        </div>
      )}

      {/* Todoリスト */}
      <div className="space-y-2">
        {filteredTodos.map((todo) => (
          <div
            key={todo.id}
            className={`flex items-center gap-3 p-3 rounded-md border transition ${
              selectedTodos.has(todo.id)
                ? 'bg-blue-900/30 border-blue-600'
                : 'bg-gray-800 border-gray-700'
            }`}
          >
            {bulkMode && (
              <input
                type="checkbox"
                checked={selectedTodos.has(todo.id)}
                onChange={() => handleSelectTodo(todo.id)}
                className="w-5 h-5"
              />
            )}
            <input
              type="checkbox"
              checked={todo.is_complete}
              onChange={() => toggleTodo(todo.id, todo.is_complete)}
              className="w-5 h-5 text-blue-500"
              disabled={bulkMode}
            />
            <span
              className={`flex-1 ${
                todo.is_complete ? 'line-through text-gray-500' : 'text-gray-200'
              }`}
            >
              {todo.title}
            </span>
            {todo.version && (
              <span className="text-xs text-gray-600" title="バージョン">
                v{todo.version}
              </span>
            )}
            {todo.category && (
              <span
                className="px-2 py-1 text-xs text-white rounded-full"
                style={{ backgroundColor: todo.category.color }}
              >
                {todo.category.name}
              </span>
            )}
            {!bulkMode && (
              <button
                onClick={() => deleteTodo(todo.id)}
                className="px-3 py-1 text-sm text-red-400 hover:bg-red-900/30 rounded transition"
              >
                削除
              </button>
            )}
          </div>
        ))}
      </div>

      {filteredTodos.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          {filterCategoryId === 'all' 
            ? 'Todoがありません。新しいTodoを追加してください。'
            : 'このカテゴリーにTodoがありません。'}
        </p>
      )}

      {bulkLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="text-white">処理中...</div>
          </div>
        </div>
      )}
    </div>
  )
}