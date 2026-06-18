'use client'

import { useActionState } from 'react'
import { resetPassword } from '@/app/actions/auth'
import { Button, TextInput } from '@/app/components/ui'

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, null)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
        <TextInput
          id="new-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="h-12"
          placeholder="Min. 8 characters"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
        <TextInput
          id="confirm-password"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="h-12"
          placeholder="Repeat new password"
        />
      </div>

      {state?.error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
          <span>!</span>
          <span>{state.error}</span>
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Updating password...' : 'Update password'}
      </Button>
    </form>
  )
}
