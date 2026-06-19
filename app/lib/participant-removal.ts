/**
 * Handles participant removal email and cleanup helpers.
 */
import { emailFrom, htmlEscape, resendClient } from '@/app/lib/email'

type RemovalEmail = {
  to: string
  participantName: string
  studyName: string
  contactEmail?: string | null
}

export async function sendParticipantRemovalEmail({ to, participantName, studyName, contactEmail }: RemovalEmail) {
  const resend = resendClient()
  if (!resend) return { configured: false, sent: false, error: 'RESEND_API_KEY is not configured.' }

  const safeName = htmlEscape(participantName || 'there')
  const safeStudy = htmlEscape(studyName)
  const safeContact = contactEmail ? htmlEscape(contactEmail) : null

  try {
    await resend.emails.send({
      from: emailFrom(),
      to,
      subject: `Update about ${studyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a; line-height: 1.55;">
          <p style="font-size: 14px; color: #64748b;">diARI study update</p>
          <h1 style="font-size: 22px; margin: 0 0 12px;">Hi ${safeName},</h1>
          <p>You have been removed from <strong>${safeStudy}</strong>.</p>
          <p>You will no longer be able to submit new diary entries for this study.</p>
          ${safeContact ? `<p style="font-size: 13px; color: #64748b;">Questions? Contact ${safeContact}.</p>` : ''}
        </div>
      `,
      text: [
        `Hi ${participantName || 'there'},`,
        '',
        `You have been removed from ${studyName}.`,
        'You will no longer be able to submit new diary entries for this study.',
        contactEmail ? `Questions? Contact ${contactEmail}.` : '',
      ].filter(Boolean).join('\n'),
    })
    return { configured: true, sent: true, error: null }
  } catch (error) {
    return {
      configured: true,
      sent: false,
      error: error instanceof Error ? error.message : 'Unknown email error.',
    }
  }
}
