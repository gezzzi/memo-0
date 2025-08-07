'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Category } from '@/types/database'

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedColor, setSelectedColor] = useState('#3B82F6')
  const [customColor, setCustomColor] = useState('#3B82F6')
  const [useCustomColor, setUseCustomColor] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const colors = [
    '#EF4444', // red
    '#F97316', // orange
    '#F59E0B', // amber
    '#22C55E', // green
    '#06B6D4', // cyan
    '#3B82F6', // blue
    '#8B5CF6', // violet
    '#EC4899', // pink
  ]

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name')

    if (error) {
      setError('カテゴリーの取得に失敗しました')
      console.error('Error fetching categories:', error)
    } else {
      setCategories(data || [])
    }
  }

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return

    setLoading(true)
    setError(null)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setError('ログインが必要です')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: newCategoryName,
        color: useCustomColor ? customColor : selectedColor,
        user_id: userData.user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        setError('同じ名前のカテゴリーが既に存在します')
      } else {
        setError('カテゴリーの作成に失敗しました')
      }
      console.error('Error creating category:', error)
    } else {
      setCategories([...categories, data])
      setNewCategoryName('')
      setSelectedColor('#3B82F6')
      setCustomColor('#3B82F6')
      setUseCustomColor(false)
    }

    setLoading(false)
  }

  const deleteCategory = async (id: string) => {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) {
      setError('カテゴリーの削除に失敗しました')
      console.error('Error deleting category:', error)
    } else {
      setCategories(categories.filter(cat => cat.id !== id))
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-100">カテゴリー管理</h2>
      
      <form onSubmit={createCategory} className="mb-6">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="新しいカテゴリー名"
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">色を選択:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUseCustomColor(false)}
                  className={`px-3 py-1 text-xs rounded-md transition ${
                    !useCustomColor 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  プリセット
                </button>
                <button
                  type="button"
                  onClick={() => setUseCustomColor(true)}
                  className={`px-3 py-1 text-xs rounded-md transition ${
                    useCustomColor 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  カスタム
                </button>
              </div>
            </div>
            
            {!useCustomColor ? (
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {colors.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-10 h-10 rounded-full border-2 transition-all ${
                      selectedColor === color 
                        ? 'border-gray-100 scale-110 shadow-lg' 
                        : 'border-gray-600 hover:border-gray-400'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`色を選択: ${color}`}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-20 h-10 rounded cursor-pointer bg-gray-700 border border-gray-600"
                  />
                </div>
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => {
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                      setCustomColor(e.target.value)
                    }
                  }}
                  placeholder="#3B82F6"
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 text-gray-100 rounded-md text-sm font-mono"
                  maxLength={7}
                />
                <div 
                  className="w-10 h-10 rounded-full border-2 border-gray-600"
                  style={{ backgroundColor: customColor }}
                  aria-label="選択中の色のプレビュー"
                />
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !newCategoryName.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            カテゴリーを追加
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 text-red-400 rounded-md border border-red-800">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {categories.map(category => (
          <div
            key={category.id}
            className="flex items-center justify-between p-3 bg-gray-700 rounded-md"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="font-medium text-gray-100">{category.name}</span>
            </div>
            <button
              onClick={() => deleteCategory(category.id)}
              className="text-red-400 hover:text-red-300"
            >
              削除
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-gray-400 text-center py-4">
            カテゴリーがまだありません
          </p>
        )}
      </div>
    </div>
  )
}