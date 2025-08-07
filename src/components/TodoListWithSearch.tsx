'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import type { Category } from '@/types/database'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { useDebounce } from '@/hooks/useDebounce'

type TodoWithSearch = {
  id: string
  title: string
  is_complete: boolean
  category_id: string | null
  created_at: string
  version: number
  category_name: string | null
  category_color: string | null
  rank?: number
}

const ITEMS_PER_PAGE = 20

export default function TodoListWithSearch({ user }: { user: User | null }) {
  // 状態管理
  const [todos, setTodos] = useState<TodoWithSearch[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState<number>(0)
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [newTodo, setNewTodo] = useState('')
  const [pageMode, setPageMode] = useState<'infinite' | 'pagination'>('infinite')
  const [currentPage, setCurrentPage] = useState(1)
  
  const supabase = createClient()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // カテゴリー取得
  useEffect(() => {
    if (user) {
      fetchCategories()
    }
  }, [user])

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('name')
    
    if (data) setCategories(data)
  }

  // 検索とページネーション
  const fetchTodos = useCallback(async (
    reset = false,
    search?: string,
    categoryId?: string,
    page?: number
  ) => {
    if (!user || loading) return

    setLoading(true)
    
    try {
      const searchTerm = search !== undefined ? search : debouncedSearchQuery
      const category = categoryId !== undefined ? categoryId : selectedCategoryId
      
      if (pageMode === 'infinite') {
        // カーソルベースページネーション（無限スクロール）
        const { data, error } = await supabase
          .rpc('get_todos_cursor', {
            p_user_id: user.id,
            p_cursor: reset ? null : cursor,
            p_limit: ITEMS_PER_PAGE,
            p_search_query: searchTerm || null,
            p_category_id: category || null
          })

        if (!error && data) {
          const todosData = data as TodoWithSearch[]
          
          if (todosData.length > 0) {
            const hasMoreData = (todosData[0] as any)?.has_more || false
            const todosWithoutMeta = todosData.map((item: any) => {
              const { has_more: _has_more, ...todo } = item
              return todo
            })
            
            setTodos(prev => reset ? todosWithoutMeta : [...prev, ...todosWithoutMeta])
            setHasMore(hasMoreData)
            
            // 次のカーソルを設定
            if (todosWithoutMeta.length > 0) {
              setCursor(todosWithoutMeta[todosWithoutMeta.length - 1].created_at)
            }
          } else {
            if (reset) setTodos([])
            setHasMore(false)
          }
        }
      } else {
        // オフセットベースページネーション（通常のページング）
        const targetPage = page !== undefined ? page : currentPage
        const offset = (targetPage - 1) * ITEMS_PER_PAGE
        
        const { data, error } = await supabase
          .rpc('search_todos', {
            p_user_id: user.id,
            p_search_query: searchTerm || null,
            p_category_id: category || null,
            p_limit: ITEMS_PER_PAGE,
            p_offset: offset
          })

        if (!error && data) {
          setTodos(data as TodoWithSearch[])
        }

        // 総件数を取得
        const { data: countData } = await supabase
          .rpc('get_pagination_info', {
            p_user_id: user.id,
            p_search_query: searchTerm || null,
            p_category_id: category || null
          })
          .single()

        if (countData) {
          const paginationInfo = countData as { total_count: number; total_pages: number; items_per_page: number }
          setTotalCount(paginationInfo.total_count)
          setHasMore(targetPage < paginationInfo.total_pages)
        }
      }
    } catch (error) {
      console.error('Error fetching todos:', error)
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [user, loading, debouncedSearchQuery, selectedCategoryId, cursor, pageMode, currentPage])

  // 初回読み込み
  useEffect(() => {
    if (user && initialLoading) {
      fetchTodos(true)
    }
  }, [user])

  // 検索クエリ変更時
  useEffect(() => {
    if (!initialLoading) {
      setCursor(null)
      setCurrentPage(1)
      fetchTodos(true)
    }
  }, [debouncedSearchQuery, selectedCategoryId])

  // 検索候補の取得
  useEffect(() => {
    if (searchQuery.length >= 2 && user) {
      fetchSearchSuggestions()
    } else {
      setSearchSuggestions([])
    }
  }, [searchQuery, user])

  const fetchSearchSuggestions = async () => {
    if (!user) return

    const { data } = await supabase
      .rpc('get_search_suggestions', {
        p_user_id: user.id,
        p_query: searchQuery,
        p_limit: 5
      })

    if (data) {
      setSearchSuggestions(data.map((item: { suggestion: string; count: number }) => item.suggestion))
    }
  }

  // 無限スクロール
  const { setLoadMoreRef } = useInfiniteScroll({
    onLoadMore: () => fetchTodos(false),
    hasMore: hasMore && pageMode === 'infinite',
    loading
  })

  // Todo追加
  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodo.trim() || !user) return

    const { data, error } = await supabase
      .from('todos')
      .insert({
        title: newTodo,
        user_id: user.id,
        category_id: selectedCategoryId || null
      })
      .select(`
        *,
        category:categories(name, color)
      `)
      .single()

    if (!error && data) {
      // 新しいTodoを先頭に追加
      const newTodoData: TodoWithSearch = {
        ...data,
        category_name: data.category?.name || null,
        category_color: data.category?.color || null
      }
      setTodos(prev => [newTodoData, ...prev])
      setNewTodo('')
      setTotalCount(prev => prev + 1)
    }
  }

  // Todo更新
  const toggleTodo = async (id: string, isComplete: boolean) => {
    const { error } = await supabase
      .from('todos')
      .update({ is_complete: !isComplete })
      .eq('id', id)

    if (!error) {
      setTodos(prev => prev.map(todo =>
        todo.id === id ? { ...todo, is_complete: !isComplete } : todo
      ))
    }
  }

  // Todo削除
  const deleteTodo = async (id: string) => {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)

    if (!error) {
      setTodos(prev => prev.filter(todo => todo.id !== id))
      setTotalCount(prev => prev - 1)
    }
  }

  // ページ変更
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchTodos(true, undefined, undefined, page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 検索のクリア
  const clearSearch = () => {
    setSearchQuery('')
    setSelectedCategoryId('')
    searchInputRef.current?.focus()
  }

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">ログインしてTodoリストを使用してください</p>
      </div>
    )
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Todo追加フォーム */}
      <form onSubmit={addTodo} className="mb-6 bg-gray-800 p-4 rounded-lg">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="新しいTodoを入力"
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 rounded-md"
          >
            <option value="">カテゴリーなし</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
          >
            追加
          </button>
        </div>
      </form>

      {/* 検索バー */}
      <div className="mb-6 bg-gray-800 p-4 rounded-lg">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Todoを検索..."
              className="w-full px-4 py-2 pl-10 bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            
            {/* 検索候補 */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setSearchQuery(suggestion)
                      setShowSuggestions(false)
                    }}
                    className="w-full px-4 py-2 text-left text-gray-200 hover:bg-gray-600 first:rounded-t-md last:rounded-b-md"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
            >
              クリア
            </button>
          )}
        </div>

        {/* ページングモード切り替え */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-400">
            {totalCount > 0 && `${totalCount}件のTodo`}
            {searchQuery && ` (「${searchQuery}」の検索結果)`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPageMode('infinite')}
              className={`px-3 py-1 text-xs rounded-md ${
                pageMode === 'infinite'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              無限スクロール
            </button>
            <button
              onClick={() => setPageMode('pagination')}
              className={`px-3 py-1 text-xs rounded-md ${
                pageMode === 'pagination'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              ページング
            </button>
          </div>
        </div>
      </div>

      {/* Todoリスト */}
      <div className="space-y-2">
        {todos.map((todo) => (
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
              {todo.rank && searchQuery && (
                <span className="ml-2 text-xs text-gray-500">
                  (関連度: {Math.round(todo.rank * 100)}%)
                </span>
              )}
            </span>
            {todo.category_name && (
              <span
                className="px-2 py-1 text-xs text-white rounded-full"
                style={{ backgroundColor: todo.category_color || '#6B7280' }}
              >
                {todo.category_name}
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

      {/* ローディング */}
      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* 無限スクロール用のトリガー */}
      {pageMode === 'infinite' && hasMore && !loading && (
        <div ref={setLoadMoreRef} className="h-10" />
      )}

      {/* ページネーション */}
      {pageMode === 'pagination' && totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            前へ
          </button>
          
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            let pageNum: number
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }

            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`px-3 py-1 rounded-md ${
                  currentPage === pageNum
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            次へ
          </button>
        </div>
      )}

      {/* 結果なし */}
      {!loading && todos.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          {searchQuery 
            ? `「${searchQuery}」に一致するTodoが見つかりません`
            : 'Todoがありません'}
        </p>
      )}
    </div>
  )
}