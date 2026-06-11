import assert from 'node:assert/strict'
import { isRemovedInviteToken, REMOVED_INVITE_PREFIX } from '../app/lib/invitation-access'

assert.equal(isRemovedInviteToken(`${REMOVED_INVITE_PREFIX}abc123`), true)
assert.equal(isRemovedInviteToken('abc123'), false)
assert.equal(isRemovedInviteToken(null), false)
assert.equal(isRemovedInviteToken(undefined), false)

console.log('Access rule checks passed.')
