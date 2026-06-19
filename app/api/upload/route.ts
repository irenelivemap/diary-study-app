/**
 * Route handler for api/upload.
 */
import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getSession } from '@/app/lib/session'
import { prisma } from '@/app/lib/db'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function safeFilename(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'upload'
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const context = String(formData.get('context') ?? '')
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'File uploads are not configured yet.' }, { status: 503 })
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only image uploads are allowed.' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image must be smaller than 8 MB.' }, { status: 400 })
  }

  let uploadPath = ''
  let access: 'public' | 'private' = 'public'

  if (context === 'study-content') {
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only researchers can upload study content.' }, { status: 403 })
    }
    uploadPath = `study-content/${session.userId}/${Date.now()}_${safeFilename(file.name)}`
  } else if (context === 'entry-answer') {
    const studyId = String(formData.get('studyId') ?? '')
    const partId = String(formData.get('partId') ?? '')
    const questionId = String(formData.get('questionId') ?? '')
    if (!studyId || !partId || !questionId) {
      return NextResponse.json({ error: 'Upload context is missing.' }, { status: 400 })
    }
    const question = await prisma.question.findFirst({
      where: {
        id: questionId,
        partId,
        studyId,
        type: 'SCREENSHOT',
        part: { isActive: true, study: { isArchived: false, status: { in: ['PREPARATION', 'ACTIVE'] } } },
      },
      select: { id: true },
    })
    const participation = await prisma.studyParticipant.findUnique({
      where: { studyId_userId: { studyId, userId: session.userId } },
      select: { consentedAt: true },
    })
    if (!question || !participation?.consentedAt) {
      return NextResponse.json({ error: 'Upload is not allowed for this question.' }, { status: 403 })
    }
    uploadPath = `entries/${studyId}/${partId}/${questionId}/${session.userId}/${Date.now()}_${safeFilename(file.name)}`
    access = 'private'
  } else {
    return NextResponse.json({ error: 'Upload context is missing.' }, { status: 400 })
  }

  const blob = await put(uploadPath, file, {
    access,
    contentType: file.type,
  })

  return NextResponse.json({
    url: access === 'private' ? `/api/upload/file?pathname=${encodeURIComponent(blob.pathname)}` : blob.url,
  })
}
