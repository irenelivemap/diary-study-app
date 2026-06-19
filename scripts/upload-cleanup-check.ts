/**
 * Checks that uploaded participant files are removed when related records are deleted.
 */
import assert from 'node:assert/strict'
import { uploadDeletionTargetFromAnswerValue } from '../app/lib/upload-cleanup'

const encodedPath = 'entries%2Fstudy-1%2Fpart-1%2Fquestion-1%2Fuser-1%2Ffile.png'

assert.equal(
  uploadDeletionTargetFromAnswerValue(`/api/upload/file?pathname=${encodedPath}`),
  'entries/study-1/part-1/question-1/user-1/file.png'
)

assert.equal(
  uploadDeletionTargetFromAnswerValue(`https://diary-study-app.vercel.app/api/upload/file?pathname=${encodedPath}`),
  'entries/study-1/part-1/question-1/user-1/file.png'
)

assert.equal(
  uploadDeletionTargetFromAnswerValue('/api/upload/file?pathname=study-content%2Fadmin%2Ffile.png'),
  null
)

assert.equal(
  uploadDeletionTargetFromAnswerValue('https://example.com/file.png'),
  null
)

assert.equal(
  uploadDeletionTargetFromAnswerValue('https://abc.public.blob.vercel-storage.com/entries/study/file.png'),
  'https://abc.public.blob.vercel-storage.com/entries/study/file.png'
)

assert.equal(
  uploadDeletionTargetFromAnswerValue('https://abc.public.blob.vercel-storage.com/study-content/admin/file.png'),
  null
)

console.log('Upload cleanup checks passed.')
