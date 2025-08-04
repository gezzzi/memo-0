'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

type Todo = {
  id: string
  title: string
  completed: boolean
  created_at: string
}

export default function TodoList({ user }: { user: User | null }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      fetchTodos()
    }
  }, [user])

  const fetchTodos = async () => {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTodos(data)
    }
    setLoading(false)
  }

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodo.trim() || !user) return

    const { data, error } = await supabase
      .from('todos')
      .insert({ title: newTodo, user_id: user.id })
      .select()
      .single()

    if (!error && data) {
      setTodos([data, ...todos])
      setNewTodo('')
    }
  }

  const toggleTodo = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from('todos')
      .update({ completed: !completed })
      .eq('id', id)

    if (!error) {
      setTodos(todos.map(todo => 
        todo.id === id ? { ...todo, completed: !completed } : todo
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

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">ログインしてTodoリストを使用してください</p>
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-8">読み込み中...</div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={addTodo} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="新しいTodoを入力"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
          >
            追加
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-md"
          >
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id, todo.completed)}
              className="w-5 h-5 text-blue-500"
            />
            <span
              className={`flex-1 ${
                todo.completed ? 'line-through text-gray-400' : 'text-gray-700'
              }`}
            >
              {todo.title}
            </span>
            <button
              onClick={() => deleteTodo(todo.id)}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition"
            >
              削除
            </button>
          </div>
        ))}
      </div>

      {todos.length === 0 && (
        <p className="text-center text-gray-400 py-8">
          Todoがありません。新しいTodoを追加してください。
        </p>
      )}
    </div>
  )
}