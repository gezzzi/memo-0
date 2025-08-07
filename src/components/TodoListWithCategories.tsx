'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import type { Category, TodoWithCategory } from '@/types/database'

export default function TodoListWithCategories({ user }: { user: User | null }) {
  const [todos, setTodos] = useState<TodoWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      Promise.all([fetchTodos(), fetchCategories()])
    } else {
      setLoading(false)
    }
  }, [user])

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
    // JOINを使用してカテゴリー情報も一緒に取得
    const { data, error } = await supabase
      .from('todos')
      .select(`
        *,
        category:categories(*)
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTodos(data as TodoWithCategory[])
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
        category:categories(*)
      `)
      .single()

    if (!error && data) {
      setTodos([data as TodoWithCategory, ...todos])
      setNewTodo('')
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
    }
  }

  // フィルタリングされたTodos
  const filteredTodos = filterCategoryId === 'all' 
    ? todos 
    : filterCategoryId === 'uncategorized'
    ? todos.filter(todo => !todo.category_id)
    : todos.filter(todo => todo.category_id === filterCategoryId)

  // カテゴリー別のTodo数を計算
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

      {/* Todoリスト */}
      <div className="space-y-2">
        {filteredTodos.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 p-3 bg-gray-800 border border-gray-700 rounded-md"
          >
            <input
              type="checkbox"
              checked={todo.is_complete}
              onChange={() => toggleTodo(todo.id, todo.is_complete)}
              className="w-5 h-5 text-blue-500"
            />
            <span
              className={`flex-1 ${
                todo.is_complete ? 'line-through text-gray-500' : 'text-gray-200'
              }`}
            >
              {todo.title}
            </span>
            {todo.category && (
              <span
                className="px-2 py-1 text-xs text-white rounded-full"
                style={{ backgroundColor: todo.category.color }}
              >
                {todo.category.name}
              </span>
            )}
            <button
              onClick={() => deleteTodo(todo.id)}
              className="px-3 py-1 text-sm text-red-400 hover:bg-red-900/30 rounded transition"
            >
              削除
            </button>
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
    </div>
  )
}