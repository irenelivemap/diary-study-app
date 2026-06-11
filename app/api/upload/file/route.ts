import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { getSession } from '@/app/lib/session'

function parseEntryUploadPath(pathname: string) {
  const parts = pathname.split('/')
  if (parts.length < 6 || parts[0] !== 'entries') return null
  const [, studyId, partId, questionId, userId] = parts
  if (!studyId || !partId || !questionId || !userId) return null
  return { studyId, partId, questionId, userId }
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pathname = request.nextUrl.searchParams.get('pathname') ?? ''
  const upload = parseEntryUploadPath(pathname)
  if (!upload) return NextResponse.json({ error: 'Invalid upload path.' }, { status: 400 })

  if (session.role !== 'ADMIN' && session.userId !== upload.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'File uploads are not configured yet.' }, { status: 503 })
  }

  const blob = await get(pathname, { access: 'private' })
  if (!blob || blob.statusCode === 304 || !blob.stream) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': blob.blob.contentType,
      'Cache-Control': 'private, max-age=60',
      'Content-Disposition': blob.blob.contentDisposition || 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
