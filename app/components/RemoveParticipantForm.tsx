'use client'

import { removeParticipantFromForm } from '@/app/actions/studies'
import { IconButton, TrashIcon } from '@/app/components/ui'

type Props = {
  studyId: string
  userId: string
  participantName: string
}

export default function RemoveParticipantForm({ studyId, userId, participantName }: Props) {
  return (
    <form
      action={removeParticipantFromForm}
      onSubmit={(event) => {
        const confirmed = confirm(
          `Remove ${participantName} from this study? Their existing responses will stay in the study data.`
        )
        if (!confirmed) event.preventDefault()
      }}
    >
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="userId" value={userId} />
      <IconButton type="submit" label={`Remove ${participantName}`} tone="trash" className="h-9 w-9">
        <TrashIcon />
      </IconButton>
    </form>
  )
}
