import { createClient } from '@/lib/supabase/server'
import AuthButton from '@/components/auth-button'
import TodoListWithSearch from '@/components/TodoListWithSearch'
import { CategoryManager } from '@/components/CategoryManager'
import StatsDashboard from '@/components/StatsDashboard'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gray-900">
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-100">Todoリスト</h1>
          <AuthButton user={user} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {user && (
          <div className="space-y-6">
            {/* 統計ダッシュボード */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <StatsDashboard user={user} />
              </div>
              <div className="lg:col-span-1">
                <CategoryManager />
              </div>
            </div>
            
            {/* Todoリスト（検索・ページネーション機能付き） */}
            <div>
              <TodoListWithSearch user={user} />
            </div>
          </div>
        )}
        {!user && (
          <TodoListWithSearch user={user} />
        )}
      </main>
    </div>
  )
}