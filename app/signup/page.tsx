'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { signup } from '@/app/actions/auth'
import { Button, TextInput } from '@/app/components/ui'


export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, null)

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          
          <span className="text-white font-semibold text-lg">diARI</span>
        </div>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight mb-4">
            Your daily voice<br />matters.
          </h2>
          <p className="text-indigo-200 text-lg leading-relaxed">
            Join a study and share your experiences. Each entry you submit helps researchers understand real life better.
          </p>
        </div>
        <p className="text-indigo-300 text-sm">Takes less than 5 minutes a day</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            
            <span className="font-semibold text-slate-900 text-lg">diARI</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h1>
          <p className="text-slate-500 text-sm mb-8">Join a diary study as a participant</p>

          <form action={action} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
              <TextInput
                name="name"
                type="text"
                required
                className="h-12"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <TextInput
                name="email"
                type="email"
                required
                className="h-12"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <TextInput
                name="password"
                type="password"
                required
                minLength={8}
                className="h-12"
                placeholder="Min. 8 characters"
              />
            </div>

            {state?.error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                <span>⚠</span>
                <span>{state.error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={pending}
              size="lg"
              className="w-full"
            >
              {pending ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-sm text-slate-500 text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
