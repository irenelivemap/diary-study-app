'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/db'
import { getSession } from '@/app/lib/session'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// ─── AI provider abstraction ──────────────────────────────────────────────────
// Set AI_PROVIDER=ollama in .env.local to use a local Ollama model.
// Defaults to Anthropic (cloud) when AI_PROVIDER is unset or 'anthropic'.
//
// Ollama env vars (all optional, shown with defaults):
//   OLLAMA_BASE_URL=http://localhost:11434/v1
//   OLLAMA_MODEL=qwen2.5
//
// Anthropic env vars:
//   ANTHROPIC_API_KEY=sk-ant-...

type AIMessage = { role: 'user'; content: string }

async function callAI(messages: AIMessage[], maxTokens: number): Promise<string> {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'

  if (provider === 'ollama') {
    const client = new OpenAI({
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
      apiKey: 'ollama', // required by the SDK but unused by Ollama
    })
    const model = process.env.OLLAMA_MODEL ?? 'qwen2.5'
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages,
    })
    return response.choices[0]?.message?.content?.trim() ?? ''
  }

  // Default: Anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.')
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages,
  })
  return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
}

function parseJSON(raw: string): unknown {
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(json)
}

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') redirect('/login')
  return session
}

const DEFAULT_TAG_COLOR = '#4f46e5'
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function cleanLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').slice(0, 40)
}

function cleanColor(color: string) {
  return COLOR_RE.test(color) ? color : DEFAULT_TAG_COLOR
}

function cleanTagIds(tagIds: string[]) {
  return Array.from(
    new Set(
      tagIds
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 12)
}

export async function createQuestionTag(studyId: string, questionId: string, label: string, color = DEFAULT_TAG_COLOR) {
  await requireAdmin()

  const question = await prisma.question.findFirst({
    where: { id: questionId, studyId, type: 'FREE_TEXT' },
    select: { id: true },
  })
  if (!question) return { error: 'Question not found.' }

  const finalLabel = cleanLabel(label)
  if (!finalLabel) return { error: 'Tag label is required.' }

  const tag = await prisma.questionTag.upsert({
    where: { questionId_label: { questionId, label: finalLabel } },
    update: { color: cleanColor(color) },
    create: { questionId, label: finalLabel, color: cleanColor(color) },
  })

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true, tag }
}

export async function updateQuestionTag(studyId: string, tagId: string, data: { label?: string; color?: string }) {
  await requireAdmin()

  const tag = await prisma.questionTag.findFirst({
    where: { id: tagId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true, questionId: true, label: true, color: true },
  })
  if (!tag) return { error: 'Tag not found.' }

  const label = data.label == null ? tag.label : cleanLabel(data.label)
  if (!label) return { error: 'Tag label is required.' }

  const updated = await prisma.questionTag.update({
    where: { id: tagId },
    data: {
      label,
      color: data.color == null ? tag.color : cleanColor(data.color),
    },
  })

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true, tag: updated }
}

export async function deleteQuestionTag(studyId: string, tagId: string) {
  await requireAdmin()

  const tag = await prisma.questionTag.findFirst({
    where: { id: tagId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true },
  })
  if (!tag) return { error: 'Tag not found.' }

  await prisma.questionTag.delete({ where: { id: tagId } })
  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true }
}

export async function updateAnswerTags(studyId: string, answerId: string, tagIds: string[]) {
  await requireAdmin()

  const answer = await prisma.answer.findFirst({
    where: { id: answerId, entry: { studyId }, question: { type: 'FREE_TEXT' } },
    select: { id: true, questionId: true },
  })
  if (!answer) return { error: 'Answer not found.' }

  const finalTagIds = cleanTagIds(tagIds)
  const allowedTags = await prisma.questionTag.findMany({
    where: { questionId: answer.questionId, id: { in: finalTagIds } },
    select: { id: true },
  })
  const allowedTagIds = allowedTags.map((tag) => tag.id)

  await prisma.$transaction([
    prisma.answerTag.deleteMany({ where: { answerId } }),
    ...(allowedTagIds.length
      ? [
          prisma.answerTag.createMany({
            data: allowedTagIds.map((tagId) => ({ answerId, tagId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ])

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true, tagIds: allowedTagIds }
}

export async function mergeQuestionTags(
  studyId: string,
  questionId: string,
  sourceTagIds: string[],
  resultLabel: string,
  resultColor: string = DEFAULT_TAG_COLOR,
) {
  await requireAdmin()

  if (!sourceTagIds.length) return { error: 'No tags to merge.' }

  const finalLabel = cleanLabel(resultLabel)
  if (!finalLabel) return { error: 'Tag label is required.' }

  const sourceTags = await prisma.questionTag.findMany({
    where: { id: { in: sourceTagIds }, questionId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true },
  })
  if (sourceTags.length !== sourceTagIds.length) return { error: 'Some tags not found.' }

  const targetTag = await prisma.questionTag.upsert({
    where: { questionId_label: { questionId, label: finalLabel } },
    update: { color: cleanColor(resultColor) },
    create: { questionId, label: finalLabel, color: cleanColor(resultColor) },
  })

  const affected = await prisma.answerTag.findMany({
    where: { tagId: { in: sourceTagIds }, answer: { entry: { studyId } } },
    select: { answerId: true },
  })
  const affectedAnswerIds = [...new Set(affected.map((r) => r.answerId))]

  if (affectedAnswerIds.length > 0) {
    await prisma.$transaction([
      prisma.answerTag.deleteMany({
        where: { tagId: { in: sourceTagIds }, answerId: { in: affectedAnswerIds } },
      }),
      prisma.answerTag.createMany({
        data: affectedAnswerIds.map((answerId) => ({ answerId, tagId: targetTag.id })),
        skipDuplicates: true,
      }),
    ])
  }

  const toDelete = sourceTagIds.filter((id) => id !== targetTag.id)
  if (toDelete.length > 0) {
    await prisma.questionTag.deleteMany({ where: { id: { in: toDelete } } })
  }

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  revalidatePath(`/admin/studies/${studyId}/analysis/${questionId}/tag`)
  return { success: true, tag: targetTag }
}

// Batch version: tags a group of answers in one AI call.
// Returns a map of answerId → { apply: tagId[], new_tags: string[] }.
export async function suggestTagsBatchWithAI(
  answers: { id: string; text: string }[],
  existingTags: { id: string; label: string }[],
  mode: 'apply' | 'explore',
): Promise<{ results: Record<string, { apply: string[]; new_tags: string[] }>; error?: string }> {
  await requireAdmin()
  if (!answers.length) return { results: {} }

  try {
    const existingTagList = existingTags.length
      ? existingTags.map((t) => `- ${t.label} (id: ${t.id})`).join('\n')
      : '(none yet)'

    const exploreInstruction = mode === 'explore'
      ? 'You may also suggest up to 2 brand-new short tag names (1–4 words) per answer if the answer contains themes not covered by existing tags.'
      : 'Only use IDs from the existing tags list. Do not invent new tag names.'

    const answerBlock = answers.map((a, i) => `[${i}] id:${a.id}\n${a.text}`).join('\n\n')

    const prompt = `You are a qualitative research assistant coding diary study responses.

Existing tags:
${existingTagList}

Answers to code (each prefixed with [index] and id):
${answerBlock}

Task: For each answer, identify which existing tags apply. ${exploreInstruction}

Return a JSON object keyed by the answer id. Example:
{"answerId1":{"apply":["tag-id-a","tag-id-b"],"new_tags":["New concept"]},"answerId2":{"apply":[],"new_tags":[]}}

Rules:
- Keys must be the exact answer ids given above
- "apply" must only contain IDs from the existing tags list
- "new_tags" must be short (1–4 words), in the same language as the answer
- Return raw JSON only — no code fences, no explanation`

    const raw = await callAI([{ role: 'user', content: prompt }], 1024)
    const parsed = parseJSON(raw) as Record<string, { apply?: string[]; new_tags?: string[] }>
    const validIds = new Set(existingTags.map((t) => t.id))
    const results: Record<string, { apply: string[]; new_tags: string[] }> = {}
    for (const [id, val] of Object.entries(parsed)) {
      results[id] = {
        apply: (val.apply ?? []).filter((tid) => validIds.has(tid)),
        new_tags: mode === 'explore' ? (val.new_tags ?? []).map((l) => String(l).trim()).filter(Boolean).slice(0, 2) : [],
      }
    }
    return { results }
  } catch (err) {
    console.error('[suggestTagsBatchWithAI]', err)
    return { results: {}, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function suggestTagsWithAI(
  answerText: string,
  existingTags: { id: string; label: string }[],
  mode: 'apply' | 'explore',
) {
  await requireAdmin()

  try {
    const existingTagList = existingTags.length
      ? existingTags.map((t) => `- ${t.label} (id: ${t.id})`).join('\n')
      : '(none yet)'

    const exploreInstruction = mode === 'explore'
      ? 'You may also suggest up to 3 brand-new tag names that do not exist yet if the answer contains themes not covered by existing tags. Return these under "new_tags" as plain label strings.'
      : 'Only suggest from the existing tags list. Do not invent new tag names.'

    const prompt = `You are a qualitative research assistant helping a researcher code diary study responses.

Existing tags:
${existingTagList}

Answer to analyse:
"""
${answerText}
"""

Task: Identify which existing tags are relevant to this answer. ${exploreInstruction}

Respond with JSON only, no markdown, no explanation:
{"apply":["id-of-tag"],"new_tags":["New tag label"]}

Rules:
- "apply" must only contain IDs from the existing tags list above
- "new_tags" should be short (1–4 words), specific, and in the same language as the answer
- If nothing applies, return {"apply":[],"new_tags":[]}
- Return raw JSON only — no code fences, no extra text`

    const raw = await callAI([{ role: 'user', content: prompt }], 256)
    const parsed = parseJSON(raw) as { apply?: string[]; new_tags?: string[] }
    const validIds = new Set(existingTags.map((t) => t.id))
    return {
      apply: (parsed.apply ?? []).filter((id) => validIds.has(id)),
      new_tags: mode === 'explore' ? (parsed.new_tags ?? []).map((l) => String(l).trim()).filter(Boolean).slice(0, 3) : [],
    }
  } catch (err) {
    console.error('[suggestTagsWithAI]', err)
    return { apply: [], new_tags: [], error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ─── NEW: Tag hierarchy actions ───────────────────────────────────────────────

export async function setTagParent(studyId: string, tagId: string, parentId: string | null) {
  await requireAdmin()

  const tag = await prisma.questionTag.findFirst({
    where: { id: tagId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true, questionId: true },
  })
  if (!tag) return { error: 'Tag not found.' }

  if (parentId !== null) {
    const parent = await prisma.questionTag.findFirst({
      where: { id: parentId, questionId: tag.questionId },
      select: { id: true, parentId: true },
    })
    if (!parent) return { error: 'Parent tag not found.' }
    if (parent.parentId !== null) return { error: 'Only one level of nesting allowed. The parent tag must be a top-level theme.' }
    // Prevent cycles: cannot set a child as parent of itself
    if (parentId === tagId) return { error: 'A tag cannot be its own parent.' }
  }

  await prisma.questionTag.update({
    where: { id: tagId },
    data: { parentId },
  })

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true }
}

export async function updateTagDescription(studyId: string, tagId: string, description: string) {
  await requireAdmin()

  const tag = await prisma.questionTag.findFirst({
    where: { id: tagId, question: { studyId, type: 'FREE_TEXT' } },
    select: { id: true },
  })
  if (!tag) return { error: 'Tag not found.' }

  const updated = await prisma.questionTag.update({
    where: { id: tagId },
    data: { description: description.trim() || null },
  })

  revalidatePath(`/admin/studies/${studyId}/analysis`)
  return { success: true, tag: updated }
}

export async function consolidateTagsWithAI(
  studyId: string,
  questionId: string,
  tags: { id: string; label: string }[],
) {
  await requireAdmin()

  if (!tags.length) return { themes: [], error: 'No tags to consolidate.' }

  try {
    const tagList = tags.map((t) => `- ${t.label} (id: ${t.id})`).join('\n')

    const prompt = `You are a qualitative research assistant helping to organise codes from a diary study into themes.

Codes to group:
${tagList}

Task: Group these codes into 4–8 meaningful themes suitable for thematic analysis. Every code must belong to exactly one theme.

For each theme provide:
- A short name (2–4 words)
- A one-sentence description of what the theme covers
- The IDs of all codes belonging to that theme

Return JSON only (no code fences, no explanation):
{"themes":[{"name":"...","description":"...","tagIds":["id1","id2"]}]}`

    const raw = await callAI([{ role: 'user', content: prompt }], 4096)
    const parsed = parseJSON(raw) as { themes?: { name: string; description: string; tagIds: string[] }[] }
    const validIds = new Set(tags.map((t) => t.id))

    const themes = (parsed.themes ?? []).map((theme) => ({
      name: String(theme.name ?? '').trim(),
      description: String(theme.description ?? '').trim(),
      tagIds: (theme.tagIds ?? []).filter((id) => validIds.has(id)),
    })).filter((t) => t.name && t.tagIds.length > 0)

    return { themes }
  } catch (err) {
    console.error('[consolidateTagsWithAI]', err)
    return { themes: [], error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function suggestThemeName(tagLabels: string[]) {
  await requireAdmin()

  if (!tagLabels.length) return { error: 'No tag labels provided.' }

  try {
    const prompt = `Given these qualitative codes from a diary study: ${tagLabels.join(', ')}. Suggest a concise theme name (2-4 words) and a one-sentence description. Return JSON only: {"name":"...","description":"..."}`

    const raw = await callAI([{ role: 'user', content: prompt }], 128)
    const parsed = parseJSON(raw) as { name?: string; description?: string }
    if (!parsed.name) return { error: 'AI did not return a valid name.' }

    return {
      name: String(parsed.name).trim(),
      description: String(parsed.description ?? '').trim(),
    }
  } catch (err) {
    console.error('[suggestThemeName]', err)
    return { error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
