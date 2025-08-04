import { createClient } from '@/lib/supabase/server'
import AuthButton from '@/components/auth-button'
import TodoList from '@/components/todo-list'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Todoリスト</h1>
          <AuthButton user={user} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <TodoList user={user} />
      </main>
    </div>
  )
}