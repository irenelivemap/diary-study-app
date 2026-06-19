'use client'
/**
 * Participant consent panel shown before joining or answering a study.
 */
import { useActionState } from 'react'
import { acceptConsent } from '@/app/actions/studies'
import { Button } from '@/app/components/ui'

type Props = {
  studyId: string
  studyName: string
  description?: string | null
  consentText?: string | null
  contactEmail?: string | null
}

export default function ConsentCard({ studyId, studyName, description, consentText, contactEmail }: Props) {
  const [state, action, pending] = useActionState(acceptConsent, null)
  const timezone = typeof Intl === 'undefined' ? '' : Intl.DateTimeFormat().resolvedOptions().timeZone || ''

  return (
    <form action={action} className="space-y-5 px-5 py-5 sm:px-6">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="timezone" value={timezone} />

      <div>
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">Before you start</p>
        <h3 className="mt-1 text-xl font-bold text-slate-950">{studyName}</h3>
        {description && <p className="mt-2 text-base leading-relaxed text-slate-600">{description}</p>}
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">What to expect</p>
        <p>Answer each entry as honestly as you can. There are no right or wrong answers.</p>
        <p>Your local timezone is saved so entries and reminders use the right date for you.</p>
      </div>

      <div className="rounded-2xl bg-white px-4 py-3 text-base leading-relaxed text-slate-700 ring-1 ring-slate-200">
        {consentText || 'By continuing, you confirm that you understand what this diary study asks you to do and agree to submit responses for research purposes.'}
      </div>

      {contactEmail && (
        <p className="text-sm text-slate-500">
          Questions or technical issues? Contact <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:underline">{contactEmail}</a>.
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <input type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 rounded text-indigo-600" />
        <span className="text-base leading-relaxed text-slate-700">I understand the study instructions and agree to participate.</span>
      </label>

      {state?.error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error as string}</p>}

      <Button
        disabled={pending}
        className="w-full"
        size="lg"
      >
        {pending ? 'Saving…' : 'Start study'}
      </Button>
    </form>
  )
}
