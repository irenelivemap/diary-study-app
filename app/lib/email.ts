/**
 * Creates the shared Resend email client from environment configuration.
 */
import { Resend } from 'resend'

const EMAIL_SEND_TIMEOUT_MS = 8_000

function normalizeBaseUrl(value: string | undefined | null) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function appBaseUrl() {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
    || normalizeBaseUrl(process.env.APP_URL)
    || normalizeBaseUrl(vercelUrl)
    || 'http://localhost:3000'
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

export async function withEmailTimeout<T>(send: () => Promise<T>, timeoutMs = EMAIL_SEND_TIMEOUT_MS) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      send(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Email provider did not confirm delivery within ${Math.round(timeoutMs / 1000)} seconds.`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
