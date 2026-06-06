import { Resend } from 'resend'

export function appBaseUrl() {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000')
}

export function emailFrom() {
  return process.env.EMAIL_FROM || 'diARI <onboarding@resend.dev>'
}

export function resendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return new Resend(apiKey)
}

export function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
