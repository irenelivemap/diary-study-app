import { appBaseUrl, emailFrom, htmlEscape, resendClient, withEmailTimeout } from '@/app/lib/email'

type InvitationEmail = {
  to: string
  studyName: string
  inviterName: string
  inviteUrl: string
}

export async function sendStudyInvitationEmail({ to, studyName, inviterName, inviteUrl }: InvitationEmail) {
  const resend = resendClient()
  if (!resend) return { configured: false, sent: false, error: 'RESEND_API_KEY is not configured.' }

  const safeStudy = htmlEscape(studyName)
  const safeInviter = htmlEscape(inviterName)
  const safeUrl = htmlEscape(inviteUrl)

  try {
    await withEmailTimeout(() => resend.emails.send({
      from: emailFrom(),
      to,
      subject: `You're invited to ${studyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a; line-height: 1.55;">
          <p style="font-size: 14px; color: #64748b;">diARI study invitation</p>
          <h1 style="font-size: 22px; margin: 0 0 12px;">You've been invited to a diary study</h1>
          <p>${safeInviter} invited you to join <strong>${safeStudy}</strong>.</p>
          <p style="margin: 28px 0;">
            <a href="${safeUrl}" style="background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; display: inline-block;">
              Join the study
            </a>
          </p>
          <p style="font-size: 13px; color: #64748b;">If the button does not work, open this link: ${safeUrl}</p>
        </div>
      `,
      text: [
        `${inviterName} invited you to join ${studyName}.`,
        '',
        `Join the study: ${inviteUrl}`,
      ].join('\n'),
    }))
    return { configured: true, sent: true, error: null }
  } catch (error) {
    return {
      configured: true,
      sent: false,
      error: error instanceof Error ? error.message : 'Unknown email error.',
    }
  }
}

export function invitationUrl(token: string) {
  return `${appBaseUrl().replace(/\/$/, '')}/join/${token}`
}
