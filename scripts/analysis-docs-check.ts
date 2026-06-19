/**
 * Verifies that the analysis and data documentation mentions the behaviors the product depends on.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const guide = readFileSync(join(root, 'docs/operating-guide.md'), 'utf8')
const dataExplorer = readFileSync(join(root, 'app/components/DataExplorer.tsx'), 'utf8')
const analysisDashboard = readFileSync(join(root, 'app/components/AnalysisDashboard.tsx'), 'utf8')
const exportRoute = readFileSync(join(root, 'app/admin/studies/[id]/export/route.ts'), 'utf8')

assert.match(guide, /## Data And Analysis Reference/, 'Operating guide should include a Data and Analysis reference section.')
assert.match(guide, /Each row represents one submitted entry/, 'Guide should define the Data tab row model.')
assert.match(guide, /Anonymize download/, 'Guide should explain anonymized downloads.')
assert.match(guide, /Fieldwork data only/, 'Guide should explain pilot/fieldwork filtering.')
assert.match(guide, /Answer completion/, 'Guide should explain answer completion.')
assert.match(guide, /Missing answers/, 'Guide should explain missing answers.')
assert.match(guide, /Free text[\s\S]*Create tags per question/, 'Guide should explain free-text tagging.')
assert.match(guide, /Tags are included in CSV exports/, 'Guide should mention tag export.')
assert.match(guide, /Rating scales[\s\S]*Interpret averages carefully/, 'Guide should caution against overreading rating-scale means.')
assert.match(guide, /Multiple choice percentages may add to more than 100%/, 'Guide should explain multiple-choice percentage behavior.')
assert.match(guide, /Journey continuity[\s\S]*All stages submitted[\s\S]*Stage coverage/, 'Guide should explain journey continuity metrics.')
assert.match(guide, /Export plots only after checking titles, subtitles and axis settings/, 'Guide should document plot export controls.')

assert.match(dataExplorer, /Anonymize download/, 'Data tab should expose anonymized export control.')
assert.match(dataExplorer, /Fieldwork data only/, 'Data tab should expose fieldwork/pilot filtering.')
assert.match(dataExplorer, /columns selected for CSV export/, 'Data tab should expose column selection.')
assert.match(analysisDashboard, /Answer completion/, 'Analysis tab should expose answer completion.')
assert.match(analysisDashboard, /Missing answers/, 'Analysis tab should expose missing answers.')
assert.match(analysisDashboard, /Journey continuity/, 'Analysis tab should expose journey continuity.')
assert.match(analysisDashboard, /Create tag/, 'Analysis tab should expose free-text tag creation.')
assert.match(analysisDashboard, /Edit plot title and subtitle/, 'Analysis tab should expose plot title/subtitle editing.')
assert.match(exportRoute, /tags/, 'CSV export should include free-text tags.')

console.log('Analysis and data documentation checks passed.')
