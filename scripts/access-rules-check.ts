/**
 * Checks a small but important access-control rule for removed invitations.
 *
 * When a participant invite is removed, the app marks its token with a reserved
 * prefix instead of treating it like a usable invite. This script verifies that
 * the helper recognises removed invite tokens and does not accidentally block
 * normal, null, or missing tokens.
 *
 * Run as part of `npm run qa`.
 */
import assert from 'node:assert/strict'
import { isRemovedInviteToken, REMOVED_INVITE_PREFIX } from '../app/lib/invitation-access'

assert.equal(isRemovedInviteToken(`${REMOVED_INVITE_PREFIX}abc123`), true)
assert.equal(isRemovedInviteToken('abc123'), false)
assert.equal(isRemovedInviteToken(null), false)
assert.equal(isRemovedInviteToken(undefined), false)

console.log('Access rule checks passed.')
