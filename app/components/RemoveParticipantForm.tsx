'use client'
/**
 * Admin form for removing a participant from a study.
 */

import { useState } from 'react'
import { removeParticipantFromForm } from '@/app/actions/studies'
import { Button, IconButton, TrashIcon } from '@/app/components/ui'

type Props = {
  studyId: string
  userId: string
  participantName: string
}

export default function RemoveParticipantForm({ studyId, userId, participantName }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [notifyParticipant, setNotifyParticipant] = useState(false)
  const [deleteParticipantData, setDeleteParticipantData] = useState(false)

  return (
    <>
      <IconButton type="button" onClick={() => setIsOpen(true)} label={`Remove ${participantName}`} tone="trash" className="h-9 w-9">
        <TrashIcon />
      </IconButton>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Remove participant?</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {participantName} will no longer be able to join this study or submit new entries. Choose whether to keep or delete their existing responses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close remove participant dialog"
              >
                x
              </button>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={deleteParticipantData}
                onChange={(event) => setDeleteParticipantData(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Delete this participant&apos;s data</span>
                <span className="mt-0.5 block text-sm leading-snug text-slate-500">
                  Permanently remove all entries and answers from this study. Leave unchecked to keep responses in analysis and exports.
                </span>
              </span>
            </label>

            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={notifyParticipant}
                onChange={(event) => setNotifyParticipant(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Send email notification</span>
                <span className="mt-0.5 block text-sm leading-snug text-slate-500">
                  Tell them they have been removed and cannot submit new entries.
                </span>
              </span>
            </label>

            <form action={removeParticipantFromForm} className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <input type="hidden" name="studyId" value={studyId} />
              <input type="hidden" name="userId" value={userId} />
              {notifyParticipant && <input type="hidden" name="notifyParticipant" value="true" />}
              {deleteParticipantData && <input type="hidden" name="deleteParticipantData" value="true" />}
              <Button type="button" tone="secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" tone="danger">
                Remove participant
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
