export const REMOVED_INVITE_PREFIX = 'removed_'

export function isRemovedInviteToken(token: string | null | undefined) {
  return typeof token === 'string' && token.startsWith(REMOVED_INVITE_PREFIX)
}
