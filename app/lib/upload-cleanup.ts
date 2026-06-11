import { del } from '@vercel/blob'

const PRIVATE_UPLOAD_ROUTE = '/api/upload/file'
const BLOB_HOST_SUFFIX = '.blob.vercel-storage.com'

function isSafeBlobPathname(pathname: string | null) {
  return !!pathname
    && pathname.startsWith('entries/')
    && !pathname.includes('..')
    && !pathname.startsWith('/')
}

export function uploadDeletionTargetFromAnswerValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed)
      : new URL(trimmed, 'https://diari.local')

    if (url.pathname === PRIVATE_UPLOAD_ROUTE) {
      const pathname = url.searchParams.get('pathname')
      return isSafeBlobPathname(pathname) ? pathname : null
    }

    if (url.hostname.endsWith(BLOB_HOST_SUFFIX)) {
      const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      return isSafeBlobPathname(pathname) ? trimmed : null
    }
  } catch {
    return null
  }

  return null
}

export async function deleteUploadedAnswerFiles(values: Array<string | null | undefined>) {
  const targets = Array.from(new Set(values.map(uploadDeletionTargetFromAnswerValue).filter(Boolean))) as string[]
  if (targets.length === 0) return { attempted: 0, deleted: 0, skipped: false }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { attempted: targets.length, deleted: 0, skipped: true }

  try {
    await del(targets)
    return { attempted: targets.length, deleted: targets.length, skipped: false }
  } catch (error) {
    console.error('Could not delete uploaded answer files', error)
    return { attempted: targets.length, deleted: 0, skipped: true }
  }
}
