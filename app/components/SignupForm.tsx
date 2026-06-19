'use client'
/**
 * Participant signup form used during invite and account creation flows.
 */

import { useActionState } from 'react'
import Link from 'next/link'
import { signup } from '@/app/actions/auth'
import PasswordInput from '@/app/components/auth/PasswordInput'
import { Button, TextInput } from '@/app/components/ui'

export default function SignupForm({
  invitedEmail = '',
  inviteToken = '',
  externalParticipantId = '',
}: {
  invitedEmail?: string
  inviteToken?: string
  externalParticipantId?: string
}) {
  const [state, action, pending] = useActionState(signup, null)
  const loginHref = inviteToken
    ? `/login?${new URLSearchParams({
        next: `/join/${inviteToken}${externalParticipantId ? `?${new URLSearchParams({ external_id: externalParticipantId }).toString()}` : ''}`,
      }).toString()}`
    : '/login'

  return (
    <form action={action} className="space-y-4">
      {inviteToken && <input type="hidden" name="inviteToken" value={inviteToken} />}
      {externalParticipantId && <input type="hidden" name="externalParticipantId" value={externalParticipantId} />}
      <div>
        <label htmlFor="signup-name" className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
        <TextInput
          id="signup-name"
          name="name"
          type="text"
          required
          className="h-12"
          placeholder="Jane Smith"
        />
      </div>
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
        <TextInput
          id="signup-email"
          name="email"
          type="email"
          required
          defaultValue={invitedEmail}
          className="h-12"
          placeholder="you@example.com"
        />
      </div>
      <PasswordInput
        id="signup-password"
        name="password"
        label="Password"
        required
        minLength={8}
        className="h-12"
        placeholder="Min. 8 characters"
      />

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
        <Link href={loginHref} className="text-indigo-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
