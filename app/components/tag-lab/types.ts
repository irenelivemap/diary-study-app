export type TagDefinition = {
  id: string
  label: string
  color: string
  parentId: string | null
  description: string | null
  sortOrder: number
  isTheme: boolean
}

export type Answer = {
  entryId: string
  participantName: string
  participantEmail: string
  date: string
  submittedAt: string
  answerId: string
  answer: string
  tags: { id: string; label: string; color: string }[]
}

export type AnswerSortBy = 'newest' | 'oldest' | 'name-az' | 'longest' | 'shortest'
export type InsertionIndicator = { tagId: string; position: 'before' | 'after' } | null
export type SaveNotice = { tone: 'success' | 'error'; message: string } | null
export type FilterOption = { value: string; label: string; color?: string }

export type ProposedTheme = {
  tempId: string
  name: string
  description: string
  tagIds: string[]
  color: string
}
