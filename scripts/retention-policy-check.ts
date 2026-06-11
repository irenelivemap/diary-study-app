import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const overviewPage = readFileSync(join(root, 'app/admin/studies/[id]/page.tsx'), 'utf8')
const guide = readFileSync(join(root, 'docs/operating-guide.md'), 'utf8')
const studyActions = readFileSync(join(root, 'app/actions/studies.ts'), 'utf8')
const entryActions = readFileSync(join(root, 'app/actions/entries.ts'), 'utf8')
const participantRemovalDialog = readFileSync(join(root, 'app/components/RemoveParticipantForm.tsx'), 'utf8')
const studyActionsMenu = readFileSync(join(root, 'app/components/StudyActionsMenu.tsx'), 'utf8')
const dataExplorer = readFileSync(join(root, 'app/components/DataExplorer.tsx'), 'utf8')

assert.match(overviewPage, /Data retention/, 'Study overview should expose the data retention policy.')
assert.match(overviewPage, /Close study[\s\S]*Stops new participant submissions/, 'Overview should explain closing a study.')
assert.match(overviewPage, /Archive study[\s\S]*Past studies[\s\S]*Research data is kept/, 'Overview should explain archiving a study.')
assert.match(overviewPage, /Remove participant[\s\S]*choose whether their existing responses stay/, 'Overview should explain participant removal choices.')
assert.match(overviewPage, /Delete permanently[\s\S]*uploaded answer files[\s\S]*cannot be undone/, 'Overview should explain permanent deletion.')

assert.match(guide, /## Retention And Deletion Policy/, 'Operating guide should include a retention and deletion policy section.')
assert.match(guide, /Close study[\s\S]*Nothing\./, 'Guide should state that closing removes nothing.')
assert.match(guide, /Archive study[\s\S]*Nothing\./, 'Guide should state that archiving removes nothing.')
assert.match(guide, /Delete study permanently[\s\S]*uploaded answer files/, 'Guide should state that permanent deletion removes uploaded answer files.')
assert.match(guide, /Remove participant and keep data[\s\S]*existing entries remain/, 'Guide should document participant removal with retained data.')
assert.match(guide, /Remove participant and delete data[\s\S]*uploaded answer files/, 'Guide should document participant removal with deleted data.')
assert.match(guide, /Delete one entry[\s\S]*uploaded answer files/, 'Guide should document entry deletion file cleanup.')

assert.match(studyActions, /archiveStudy[\s\S]*lifecyclePersistence\(StudyStatus\.ARCHIVED\)/, 'Archive should set archived lifecycle status.')
assert.match(studyActions, /deleteStudy[\s\S]*prisma\.study\.delete[\s\S]*deleteUploadedAnswerFiles/, 'Permanent study deletion should remove study records and uploaded answer files.')
assert.match(studyActions, /removeParticipant[\s\S]*deleteParticipantData[\s\S]*prisma\.entry\.deleteMany[\s\S]*deleteUploadedAnswerFiles/, 'Participant data deletion should remove entries and uploaded files.')
assert.match(entryActions, /deleteEntryFromForm[\s\S]*prisma\.entry\.delete[\s\S]*deleteUploadedAnswerFiles/, 'Entry deletion should remove uploaded answer files.')

assert.match(studyActionsMenu, /Type DELETE to confirm/, 'Permanent study deletion should require typed confirmation.')
assert.match(participantRemovalDialog, /Delete this participant&apos;s data/, 'Participant removal should ask whether to delete data.')
assert.match(dataExplorer, /Delete this entry\?[\s\S]*permanently remove the entry/, 'Entry deletion dialog should explain the destructive outcome.')

console.log('Retention policy checks passed.')
