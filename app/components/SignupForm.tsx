'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signup } from '@/app/actions/auth'
import { Button, TextInput } from '@/app/components/ui'

export default function SignupForm({ invitedEmail = '' }: { invitedEmail?: string }) {
  const [state, action, pending] = useActionState(signup, null)

  return (
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
          defaultValue={invitedEmail}
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
          <span>!</span>
          <span>{state.error}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={pending}
        size="lg"
        className="w-full"
      >
        {pending ? 'Creating account...' : 'Create account'}
      </Button>

      <p className="mt-6 text-sm text-slate-500 text-center">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
