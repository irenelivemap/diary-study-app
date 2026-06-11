import { notFound } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'
import { joinStudyWithInvite } from '@/app/actions/studies'
import { Button, ButtonLink } from '@/app/components/ui'
import { acceptsParticipantEntries } from '@/app/lib/study-lifecycle'
import { isRemovedInviteToken } from '@/app/lib/invitation-access'

export default async function JoinStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ external_id?: string; participant_id?: string; tt_id?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const externalParticipantId = String(query.external_id ?? query.participant_id ?? query.tt_id ?? '').trim().slice(0, 120)
  const joinPath = `/join/${token}${externalParticipantId ? `?${new URLSearchParams({ external_id: externalParticipantId }).toString()}` : ''}`
  const session = await getSession()
  const invitation = await prisma.studyInvitation.findUnique({
    where: { token },
    include: { study: { select: { id: true, name: true, description: true, status: true, isActive: true, isArchived: true } } },
  })
  const study = invitation?.study ?? await prisma.study.findUnique({
    where: { inviteToken: token },
    select: { id: true, name: true, description: true, status: true, isActive: true, isArchived: true },
  })
  if (!study || !acceptsParticipantEntries(study) || isRemovedInviteToken(invitation?.token)) notFound()

  async function join(formData: FormData) {
    'use server'
    await joinStudyWithInvite(null, formData)
  }

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">Study invite</p>
        <h1 className="text-xl font-bold text-slate-900 mt-1">{study.name}</h1>
        {study.description && <p className="text-sm text-slate-500 mt-3 leading-relaxed">{study.description}</p>}

        {session ? (
          <form action={join} className="mt-6">
            <input type="hidden" name="token" value={token} />
            {externalParticipantId && <input type="hidden" name="externalParticipantId" value={externalParticipantId} />}
            <Button className="w-full" size="lg">
              Join study
            </Button>
            <p className="text-xs text-slate-400 text-center mt-3">
              {invitation && invitation.email.toLowerCase() !== session.email.toLowerCase()
                ? `This invite is for ${invitation.email}. You are signed in as ${session.email}.`
                : `You are signed in as ${session.email}.`}
            </p>
          </form>
        ) : (
          <div className="mt-6 space-y-3">
            <ButtonLink
              href={`/login?${new URLSearchParams({ next: joinPath }).toString()}`}
              className="w-full"
              size="lg"
            >
              Sign in to join
            </ButtonLink>
            <ButtonLink
              href={`/signup?${new URLSearchParams({
                ...(invitation ? { email: invitation.email } : {}),
                inviteToken: token,
                ...(externalParticipantId ? { externalParticipantId } : {}),
              }).toString()}`}
              className="w-full"
              tone="secondary"
              size="lg"
            >
              Create participant account
            </ButtonLink>
            <p className="text-xs text-slate-400 text-center">
              {invitation
                ? `Use ${invitation.email} so the study connects automatically.`
                : 'After signing in, open this invite link again to join.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
