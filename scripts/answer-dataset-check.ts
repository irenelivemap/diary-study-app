/**
 * Checks the answer dataset helper so exports, analysis, and data tables keep using a stable shape.
 */
import assert from 'node:assert/strict'
import {
  NOT_SHOWN_LABEL,
  answerValue,
  answerWasShown,
  buildDatasetRows,
  cleanAnswerValue,
  countPilotRows,
  csvCell,
  dataTypeLabel,
  datasetHasJourney,
  datasetQualityFlags,
  filterDatasetRowsByPilot,
  formatAnswerValue,
  formatQualityFlags,
  formatVisibleAnswer,
  parseMultipleChoiceAnswer,
} from '../app/lib/answer-dataset'

assert.equal(cleanAnswerValue('  hello  '), 'hello')
assert.equal(cleanAnswerValue(''), '')
assert.equal(cleanAnswerValue('N/A - not shown'), '')

assert.equal(answerWasShown(undefined), true)
assert.equal(answerWasShown({ value: 'x' }), true)
assert.equal(answerWasShown({ value: 'x', wasShown: true }), true)
assert.equal(answerWasShown({ value: 'x', wasShown: false }), false)

assert.equal(answerValue({ value: '  saved answer  ', wasShown: true }), 'saved answer')
assert.equal(answerValue({ value: 'N/A - not shown', wasShown: false }), '')

assert.deepEqual(parseMultipleChoiceAnswer('["Work / study","Family / social"]'), ['Work / study', 'Family / social'])
assert.deepEqual(parseMultipleChoiceAnswer('Personal errands'), ['Personal errands'])
assert.deepEqual(parseMultipleChoiceAnswer(''), [])
assert.deepEqual(parseMultipleChoiceAnswer('["", "Rest / leisure"]'), ['Rest / leisure'])

assert.equal(formatAnswerValue('["Work / study","Family / social"]', 'MULTIPLE_CHOICE'), 'Work / study; Family / social')
assert.equal(formatAnswerValue('  Open text  ', 'FREE_TEXT'), 'Open text')

assert.equal(
  formatVisibleAnswer({ value: 'N/A - not shown', wasShown: false }, 'FREE_TEXT'),
  NOT_SHOWN_LABEL
)
assert.equal(
  formatVisibleAnswer({ value: '["Cost","Weather"]', wasShown: true }, 'MULTIPLE_CHOICE'),
  'Cost; Weather'
)

assert.equal(dataTypeLabel(false), 'Fieldwork')
assert.equal(dataTypeLabel(undefined), 'Fieldwork')
assert.equal(dataTypeLabel(true), 'Pilot')

assert.equal(formatQualityFlags(['late', 'out_of_order', 'retrospective']), 'Late; Out of order; Retrospective')
assert.equal(csvCell('plain'), '"plain"')
assert.equal(csvCell('said "hello"'), '"said ""hello"""')

const rows = buildDatasetRows([
  {
    id: 'part-1',
    name: 'Before',
    entries: [
      {
        id: 'entry-1',
        date: '2026-06-10',
        submittedAt: new Date('2026-06-10T09:00:00Z'),
        timezone: 'Europe/Zurich',
        isPilot: true,
        qualityFlags: ['late'],
        user: { id: 'user-1', name: 'Participant One', email: 'one@example.com' },
        journey: { id: 'journey-1', label: 'Visit #1' },
        answers: [
          {
            questionId: 'question-1',
            value: 'Visible answer',
            wasShown: true,
            tags: [{ tag: { label: 'Useful detail' } }],
          },
          {
            questionId: 'question-2',
            value: 'N/A - not shown',
            wasShown: false,
            tags: [],
          },
        ],
      },
      {
        id: 'entry-2',
        date: '2026-06-11',
        submittedAt: '2026-06-11T09:00:00.000Z',
        user: { id: 'user-2', name: 'Participant Two', email: 'two@example.com' },
        answers: [],
      },
    ],
  },
])

assert.equal(rows.length, 2)
assert.equal(rows[0].entryId, 'entry-1')
assert.equal(rows[0].partName, 'Before')
assert.equal(rows[0].participantEmail, 'one@example.com')
assert.equal(rows[0].journeyLabel, 'Visit #1')
assert.equal(rows[0].isPilot, true)
assert.deepEqual(rows[0].qualityFlags, ['late'])
assert.equal(rows[0].answers['question-1'], 'Visible answer')
assert.equal(rows[0].answerShown['question-2'], false)
assert.deepEqual(rows[0].answerTags['question-1'], ['Useful detail'])
assert.equal(rows[1].isPilot, false)
assert.equal(countPilotRows(rows), 1)
assert.equal(filterDatasetRowsByPilot(rows, false).length, 1)
assert.equal(filterDatasetRowsByPilot(rows, true).length, 2)
assert.equal(datasetHasJourney(rows), true)
assert.deepEqual(datasetQualityFlags(rows), ['late'])

console.log('Answer dataset checks passed.')
