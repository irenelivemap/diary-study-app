'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { login } from '@/app/actions/auth'
import { Button, TextInput } from '@/app/components/ui'


export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null)

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          
          <span className="text-white font-semibold text-lg">diARI</span>
        </div>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight mb-4">
            Capture real experiences,<br />in the moment.
          </h2>
          <p className="text-indigo-200 text-lg leading-relaxed">
            A research platform for diary studies that lets you understand people's daily lives with rich, longitudinal data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Daily entries', 'Multi-page forms', 'Rich question types', 'CSV export'].map((f) => (
            <div key={f} className="bg-white/10 rounded-lg px-3 py-1.5">
              <span className="text-white/90 text-xs font-medium">{f}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            
            <span className="font-semibold text-slate-900 text-lg">diARI</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-slate-500 text-sm mb-8">Sign in to your account</p>

          <form action={action} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <TextInput name="email" type="email" required autoComplete="email"
                placeholder="you@example.com"
                className="h-12" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <TextInput name="password" type="password" required autoComplete="current-password"
                placeholder="••••••••"
                className="h-12" />
            </div>
            {state?.error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                <span>⚠</span><span>{state.error}</span>
              </div>
            )}
            <Button type="submit" disabled={pending} size="lg" className="w-full">
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-sm text-slate-500 text-center">
            Don't have an account?{' '}
            <Link href="/signup" className="text-indigo-600 font-medium hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
