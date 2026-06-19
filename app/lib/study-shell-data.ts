import 'server-only'

import { prisma } from '@/app/lib/db'

export function loadStudyShellData(studyId: string) {
  return prisma.study.findUnique({
    where: { id: studyId },
    select: { name: true, isActive: true, status: true },
  })
}
