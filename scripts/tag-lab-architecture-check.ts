import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const workspace = readFileSync(join(root, 'app/components/TaggingWorkspace.tsx'), 'utf8')
const tagPage = readFileSync(join(root, 'app/admin/studies/[id]/analysis/[questionId]/tag/page.tsx'), 'utf8')
const tagLabData = readFileSync(join(root, 'app/lib/tag-lab-data.ts'), 'utf8')
const dataHook = readFileSync(join(root, 'app/components/tag-lab/useTagLabData.ts'), 'utf8')
const dragHook = readFileSync(join(root, 'app/components/tag-lab/useTagDragReorder.ts'), 'utf8')
const manageRows = readFileSync(join(root, 'app/components/tag-lab/ManageTagRows.tsx'), 'utf8')
const operatingGuide = readFileSync(join(root, 'docs/operating-guide.md'), 'utf8')

assert.match(workspace, /useTagLabData/, 'TaggingWorkspace should delegate tag data mutations to useTagLabData.')
assert.match(workspace, /useTagDragReorder/, 'TaggingWorkspace should delegate drag and reorder behavior to useTagDragReorder.')
assert.match(tagPage, /loadTagLabData/, 'Tag lab page should load through the dedicated tag-lab data module.')
assert.doesNotMatch(tagPage, /from ['"]@\/app\/lib\/db['"]/, 'Tag lab page should not import Prisma directly.')
assert.match(tagLabData, /plainTextFromHtml/, 'Tag lab data module should own question text normalization.')

for (const actionName of [
  'deleteQuestionTag',
  'reorderQuestionTags',
  'setTagParent',
  'suggestTagsBatchWithAI',
  'updateAnswerTags',
  'updateQuestionTag',
  'updateTagDescription',
]) {
  assert.doesNotMatch(
    workspace,
    new RegExp(`\\b${actionName}\\b`),
    `TaggingWorkspace should not directly call ${actionName}; keep that behavior inside useTagLabData.`
  )
  assert.match(
    dataHook,
    new RegExp(`\\b${actionName}\\b`),
    `useTagLabData should own ${actionName}.`
  )
}

assert.match(dragHook, /PointerSensor/, 'useTagDragReorder should own pointer drag configuration.')
assert.match(dragHook, /KeyboardSensor/, 'useTagDragReorder should own keyboard reorder configuration.')
assert.match(dragHook, /insertionIndicator/, 'useTagDragReorder should own insertion indicator state.')
assert.match(manageRows, /Alt\+Up or Alt\+Down/, 'Tag rows should expose the shared keyboard reorder shortcut.')

assert.match(
  operatingGuide,
  /Repeated list rows should keep structural controls visible/,
  'Operating guide should document the shared list-row control principle.'
)
assert.match(
  operatingGuide,
  /Drag-and-drop lists must follow the shared pattern/,
  'Operating guide should document the shared drag-and-drop interaction principle.'
)

const workspaceLines = workspace.split('\n').length
assert.ok(
  workspaceLines <= 650,
  `TaggingWorkspace should stay below 650 lines after the tag lab split; found ${workspaceLines}.`
)

console.log('Tag lab architecture checks passed.')
