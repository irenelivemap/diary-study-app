'use client'
/**
 * Signed-in profile form for changing a user password.
 */

import { useActionState, useEffect, useRef } from 'react'
import { changePassword } from '@/app/actions/auth'
import PasswordInput from '@/app/components/auth/PasswordInput'
import { Button } from '@/app/components/ui'

export default function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(changePassword, null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state?.success])

  return (
    <form ref={formRef} action={action} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-slate-950">Password</h2>
        <p className="mt-1 text-sm text-slate-500">Change the password you use to sign in.</p>
      </div>

      <div className="grid gap-4">
        <PasswordInput
          id="current-password"
          name="currentPassword"
          label="Current password"
          required
          autoComplete="current-password"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordInput
            id="new-password"
            name="password"
            label="New password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <PasswordInput
            id="confirm-password"
            name="confirmPassword"
            label="Confirm password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
      </div>

      {state?.error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      {state?.success && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Password updated.</p>}

      <div className="mt-6 flex justify-end">
        <Button disabled={pending}>
          {pending ? 'Updating...' : 'Update password'}
        </Button>
      </div>
    </form>
  )
}
