import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const studyForm = readFileSync(join(root, 'app/components/StudyForm.tsx'), 'utf8')
const operatingGuide = readFileSync(join(root, 'docs/operating-guide.md'), 'utf8')

assert.match(
  operatingGuide,
  /Drag-and-drop lists must follow the shared pattern/,
  'Operating guide should document the shared drag-and-drop interaction principle.'
)

for (const expected of [
  'questionDropIndicator',
  'optionDropIndicator',
  'landedQuestionId',
  'landedOption',
  'reorderQuestionWithKeyboard',
  'reorderOptionWithKeyboard',
  'aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"',
  'Use Alt+Up or Alt+Down',
]) {
  assert.match(studyForm, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Study setup drag system should include ${expected}.`)
}

assert.match(studyForm, /shadow-\[0_0_0_3px_var\(--accent-subtle\)\]/, 'Question drag should render a clear insertion line.')
assert.match(studyForm, /shadow-\[0_0_0_2px_var\(--accent-subtle\)\]/, 'Option drag should render a clear insertion line.')
assert.match(studyForm, /group-hover\/setup-question:opacity-60/, 'Question drag handles should stay subtle until hover or focus.')
assert.match(studyForm, /group-hover\/setup-option:opacity-80/, 'Option drag handles should stay subtle until hover or focus.')

console.log('Setup drag architecture checks passed.')
