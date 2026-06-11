import assert from 'node:assert/strict'
import { reminderEntryUrl, reminderTargetUrl } from '../app/lib/reminder-links'

const appUrl = 'https://diary-study-app.vercel.app/'
const directJourneyUrl = reminderEntryUrl(appUrl, 'study-1', 'part-2', 'journey-9')

assert.equal(
  directJourneyUrl,
  'https://diary-study-app.vercel.app/entry/new?studyId=study-1&partId=part-2&journeyId=journey-9'
)

assert.equal(
  reminderTargetUrl({
    appUrl,
    studyId: 'study-1',
    partId: 'part-2',
    directEntryUrl: directJourneyUrl,
    opensDashboard: true,
  }),
  'https://diary-study-app.vercel.app/dashboard'
)

assert.equal(
  reminderTargetUrl({
    appUrl,
    studyId: 'study-1',
    partId: 'part-1',
    opensDashboard: false,
  }),
  'https://diary-study-app.vercel.app/entry/new?studyId=study-1&partId=part-1'
)

console.log('Reminder link checks passed.')
