import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

const signupForm = readFileSync(join(root, 'app/components/SignupForm.tsx'), 'utf8')
assert.match(signupForm, /loginHref\s*=\s*inviteToken/, 'Signup should preserve invite context when linking back to login.')
assert.match(signupForm, /next:\s*`\/join\/\$\{inviteToken\}/, 'Signup login link should route back through the join page.')
assert.match(signupForm, /external_id/, 'Signup login link should preserve external participant IDs.')

const loginPage = readFileSync(join(root, 'app/login/page.tsx'), 'utf8')
assert.match(loginPage, /inviteToken[\s\S]*signupHref/, 'Login should preserve invite tokens when linking to signup.')
assert.match(loginPage, /Sign in to join the study/, 'Login should explain invite-specific sign-in.')

const joinPage = readFileSync(join(root, 'app/join/[token]/page.tsx'), 'utf8')
assert.match(joinPage, /This invite is for/, 'Join page should explain invited-email mismatch before submitting.')
assert.match(joinPage, /Sign in to join/, 'Join page should provide an invited participant sign-in path.')
assert.match(joinPage, /Create participant account/, 'Join page should provide an account creation path.')

console.log('Invite flow checks passed.')
