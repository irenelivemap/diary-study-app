'use client'
/**
 * Authentication UI component for ForgotPasswordForm.
 */

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '@/app/actions/auth'
import { Button, TextInput } from '@/app/components/ui'

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null)

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
        <TextInput
          id="reset-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-12"
          placeholder="you@example.com"
        />
      </div>

      {state?.error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
          <span>!</span>
          <span>{state.error}</span>
        </div>
      )}

      {state?.success && (
        <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
          If an account exists for that email, a password reset link has been sent.
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Sending link...' : 'Send reset link'}
      </Button>

      <p className="mt-6 text-sm text-slate-500 text-center">
        Remembered your password?{' '}
        <Link href="/login" className="text-indigo-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
