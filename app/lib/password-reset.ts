import crypto from 'node:crypto'
import { appBaseUrl, emailFrom, htmlEscape, resendClient, withEmailTimeout } from '@/app/lib/email'

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000

export function createPasswordResetToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function passwordResetTokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function passwordResetUrl(token: string) {
  const url = new URL('/reset-password', appBaseUrl())
  url.searchParams.set('token', token)
  return url.toString()
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: {
  to: string
  name: string
  resetUrl: string
}) {
  const resend = resendClient()
  if (!resend) return { configured: false, sent: false, error: 'RESEND_API_KEY is not configured.' }

  const safeName = htmlEscape(name || 'there')
  const safeUrl = htmlEscape(resetUrl)

  try {
    await withEmailTimeout(() => resend.emails.send({
      from: emailFrom(),
      to,
      subject: 'Reset your diARI password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a; line-height: 1.55;">
          <p style="font-size: 14px; color: #64748b;">diARI password reset</p>
          <h1 style="font-size: 22px; margin: 0 0 12px;">Reset your password</h1>
          <p>Hi ${safeName},</p>
          <p>Use this secure link to choose a new password. The link expires in 1 hour.</p>
          <p style="margin: 28px 0;">
            <a href="${safeUrl}" style="background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; display: inline-block;">
              Reset password
            </a>
          </p>
          <p style="font-size: 13px; color: #64748b;">If the button does not work, open this link: ${safeUrl}</p>
          <p style="font-size: 13px; color: #64748b;">If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: [
        `Hi ${name || 'there'},`,
        '',
        'Use this secure link to choose a new diARI password. The link expires in 1 hour.',
        '',
        `Reset password: ${resetUrl}`,
        '',
        'If you did not request this, you can ignore this email.',
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
