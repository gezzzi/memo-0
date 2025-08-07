import { createClient } from '@/lib/supabase/client'

// リトライの設定
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1秒

// カスタムエラークラス
export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly code: 'VERSION_CONFLICT' | 'NETWORK_ERROR' | 'PERMISSION_DENIED' | 'UNKNOWN',
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'TransactionError'
  }
}

// リトライ可能なエラーかどうかを判定
function isRetryableError(error: unknown): boolean {
  // ネットワークエラーや一時的なエラーはリトライ可能
  const err = error as { code?: string; message?: string }
  if (err.code === 'NETWORK_ERROR') return true
  if (err.message?.includes('fetch')) return true
  if (err.message?.includes('timeout')) return true
  return false
}

// 指数バックオフでリトライ
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (retries > 0 && isRetryableError(error)) {
      const delay = RETRY_DELAY * Math.pow(2, MAX_RETRIES - retries)
      console.log(`Retrying after ${delay}ms... (${retries} retries left)`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return retryWithBackoff(operation, retries - 1)
    }
    throw error
  }
}

// ============================================
// トランザクション処理API
// ============================================

/**
 * 複数のTodoを一括で完了/未完了にする（トランザクション保証）
 */
export async function bulkUpdateTodos(
  todoIds: string[],
  isComplete: boolean
): Promise<{ success: boolean; updatedCount: number }> {
  const supabase = createClient()
  
  return retryWithBackoff(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      throw new TransactionError('Not authenticated', 'PERMISSION_DENIED')
    }

    // トランザクション処理関数を呼び出し
    const { data, error } = await supabase
      .rpc('bulk_update_todos', {
        p_user_id: userData.user.id,
        p_todo_ids: todoIds,
        p_is_complete: isComplete
      })
      .single()

    if (error) {
      console.error('Bulk update error:', error)
      throw new TransactionError(
        error.message || 'Failed to update todos',
        'UNKNOWN',
        error
      )
    }

    const result = data as { success: boolean; updated_count: number; error_message?: string }

    if (!result.success) {
      throw new TransactionError(
        result.error_message || 'Transaction failed',
        'UNKNOWN'
      )
    }

    return {
      success: true,
      updatedCount: result.updated_count
    }
  })
}

/**
 * 複数のTodoのカテゴリーを一括変更（トランザクション保証）
 */
export async function bulkChangeCategory(
  todoIds: string[],
  categoryId: string | null
): Promise<{ success: boolean; updatedCount: number }> {
  const supabase = createClient()
  
  return retryWithBackoff(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      throw new TransactionError('Not authenticated', 'PERMISSION_DENIED')
    }

    const { data, error } = await supabase
      .rpc('bulk_change_category', {
        p_user_id: userData.user.id,
        p_todo_ids: todoIds,
        p_category_id: categoryId
      })
      .single()

    if (error) {
      throw new TransactionError(
        error.message || 'Failed to change categories',
        'UNKNOWN',
        error
      )
    }

    const result = data as { success: boolean; updated_count: number; error_message?: string }

    if (!result.success) {
      throw new TransactionError(
        result.error_message || 'Transaction failed',
        'UNKNOWN'
      )
    }

    return {
      success: true,
      updatedCount: result.updated_count
    }
  })
}

/**
 * 複数のTodoを一括削除（トランザクション保証）
 */
export async function bulkDeleteTodos(
  todoIds: string[]
): Promise<{ success: boolean; deletedCount: number }> {
  const supabase = createClient()
  
  return retryWithBackoff(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      throw new TransactionError('Not authenticated', 'PERMISSION_DENIED')
    }

    const { data, error } = await supabase
      .rpc('bulk_delete_todos', {
        p_user_id: userData.user.id,
        p_todo_ids: todoIds
      })
      .single()

    if (error) {
      throw new TransactionError(
        error.message || 'Failed to delete todos',
        'UNKNOWN',
        error
      )
    }

    const result = data as { success: boolean; deleted_count: number; error_message?: string }

    if (!result.success) {
      throw new TransactionError(
        result.error_message || 'Transaction failed',
        'UNKNOWN'
      )
    }

    return {
      success: true,
      deletedCount: result.deleted_count
    }
  })
}

/**
 * 楽観的ロックを使用したTodo更新
 */
export async function updateTodoWithVersion(
  todoId: string,
  updates: {
    title: string
    isComplete: boolean
    categoryId: string | null
  },
  expectedVersion: number
): Promise<{ success: boolean; newVersion: number }> {
  const supabase = createClient()
  
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    throw new TransactionError('Not authenticated', 'PERMISSION_DENIED')
  }

  const { data, error } = await supabase
    .rpc('update_todo_with_version', {
      p_user_id: userData.user.id,
      p_todo_id: todoId,
      p_title: updates.title,
      p_is_complete: updates.isComplete,
      p_category_id: updates.categoryId,
      p_expected_version: expectedVersion
    })
    .single()

  if (error) {
    throw new TransactionError(
      error.message || 'Failed to update todo',
      'UNKNOWN',
      error
    )
  }

  const result = data as { success: boolean; new_version: number; error_message?: string }

  if (!result.success) {
    // バージョン競合の場合
    if (result.error_message?.includes('Version conflict')) {
      throw new TransactionError(
        'This item was modified by another user. Please refresh and try again.',
        'VERSION_CONFLICT'
      )
    }
    throw new TransactionError(
      result.error_message || 'Update failed',
      'UNKNOWN'
    )
  }

  return {
    success: true,
    newVersion: result.new_version
  }
}

/**
 * トランザクション内で複数の操作を実行
 * 例：カテゴリー作成 + 複数Todo作成を一つのトランザクションで
 */
export async function createCategoryWithTodos(
  categoryName: string,
  categoryColor: string,
  todoTitles: string[]
): Promise<{ success: boolean; categoryId: string; todoIds: string[] }> {
  const supabase = createClient()
  
  return retryWithBackoff(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      throw new TransactionError('Not authenticated', 'PERMISSION_DENIED')
    }

    // Supabaseでは直接的なトランザクション制御はできないため、
    // エラー時に手動でロールバック処理を行う
    let categoryId: string | null = null
    const todoIds: string[] = []

    try {
      // 1. カテゴリーを作成
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .insert({
          name: categoryName,
          color: categoryColor,
          user_id: userData.user.id
        })
        .select()
        .single()

      if (categoryError) throw categoryError
      categoryId = categoryData.id

      // 2. Todosを作成
      const todosToInsert = todoTitles.map(title => ({
        title,
        user_id: userData.user.id,
        category_id: categoryId
      }))

      const { data: todosData, error: todosError } = await supabase
        .from('todos')
        .insert(todosToInsert)
        .select()

      if (todosError) {
        // エラー時はカテゴリーを削除（手動ロールバック）
        await supabase
          .from('categories')
          .delete()
          .eq('id', categoryId)
        throw todosError
      }

      todosData?.forEach(todo => todoIds.push(todo.id))

      return {
        success: true,
        categoryId: categoryId!,
        todoIds
      }
    } catch (error) {
      // クリーンアップ処理
      if (categoryId) {
        try {
          await supabase
            .from('categories')
            .delete()
            .eq('id', categoryId)
        } catch (cleanupError) {
          console.error('Cleanup failed:', cleanupError)
        }
      }

      throw new TransactionError(
        'Failed to create category with todos',
        'UNKNOWN',
        error
      )
    }
  })
}