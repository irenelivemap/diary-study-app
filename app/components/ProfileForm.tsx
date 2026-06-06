'use client'

import { useActionState } from 'react'
import { updateProfile } from '@/app/actions/auth'
import { Button, TextInput } from '@/app/components/ui'

type Props = {
  name: string
  firstName?: string | null
  lastName?: string | null
  email: string
}

export default function ProfileForm({ name, firstName, lastName, email }: Props) {
  const [state, action, pending] = useActionState(updateProfile, null)

  return (
    <form action={action} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-950">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Update how your name appears in diARI.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">First name</label>
          <TextInput name="firstName" defaultValue={firstName ?? ''} placeholder="Jane" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Last name</label>
          <TextInput name="lastName" defaultValue={lastName ?? ''} placeholder="Smith" />
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">Display name</label>
        <TextInput name="name" defaultValue={name} placeholder="Name shown in the app" />
        <p className="mt-2 text-sm text-slate-500">
          If first and last name are filled, diARI will use them as your display name.
        </p>
      </div>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
        <TextInput value={email} readOnly className="cursor-not-allowed bg-slate-100 text-slate-500" />
        <p className="mt-2 text-sm text-slate-500">Email changes are disabled for now so study invitations stay linked correctly.</p>
      </div>

      {state?.error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      {state?.success && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Profile updated.</p>}

      <div className="mt-6 flex justify-end">
        <Button disabled={pending}>
          {pending ? 'Saving...' : 'Save profile'}
        </Button>
      </div>
    </form>
  )
}
