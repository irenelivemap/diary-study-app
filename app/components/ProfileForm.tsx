'use client'
/**
 * Profile form for editing basic user details.
 */

import { useActionState } from 'react'
import { updateProfile } from '@/app/actions/auth'
import { Button, TextInput } from '@/app/components/ui'
import { DEMOGRAPHIC_FIELDS } from '@/app/lib/demographics'

type Props = {
  firstName?: string | null
  lastName?: string | null
  email: string
  demographics?: Record<string, unknown> | null
  showProfileQuestions?: boolean
}

export default function ProfileForm({ firstName, lastName, email, demographics, showProfileQuestions = true }: Props) {
  const [state, action, pending] = useActionState(updateProfile, null)

  return (
    <form action={action} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-950">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          {showProfileQuestions ? 'Update your name and optional background information.' : 'Update the name shown in the app.'}
        </p>
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
        <label className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
        <TextInput value={email} readOnly className="cursor-not-allowed bg-slate-100 text-slate-500" />
        <p className="mt-2 text-sm text-slate-500">Email changes are disabled for now so study invitations stay linked correctly.</p>
      </div>

      {showProfileQuestions && (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h2 className="text-base font-semibold text-slate-950">Optional profile questions</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            These answers are optional. They help researchers interpret responses across studies and are only included in identifiable exports.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {DEMOGRAPHIC_FIELDS.map((field) => {
              const value = String(demographics?.[field.key] ?? '')
              return (
                <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{field.label}</label>
                  {field.type === 'select' ? (
                    <select
                      name={`demographic_${field.key}`}
                      defaultValue={value}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Prefer not to answer</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      name={`demographic_${field.key}`}
                      defaultValue={value}
                      rows={3}
                      className="w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Optional"
                    />
                  ) : (
                    <TextInput name={`demographic_${field.key}`} defaultValue={value} placeholder="Optional" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

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
