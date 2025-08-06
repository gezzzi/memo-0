'use client'

import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export default function AuthButton({ user }: { user: User | null }) {
  const supabase = createClient()
  const router = useRouter()

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account'
        }
      }
    })
  }

  const handleSignUp = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline'
        }
      }
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/signout')
  }

  return user ? (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-300">
        {user.user_metadata.name || user.email}
      </span>
      <button
        onClick={handleSignOut}
        className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-md hover:bg-gray-600 transition"
      >
        ログアウト
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSignIn}
        className="px-4 py-2 text-sm bg-gray-700 text-gray-200 rounded-md hover:bg-gray-600 transition"
      >
        ログイン
      </button>
      <button
        onClick={handleSignUp}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
      >
        新規登録
      </button>
    </div>
  )
}