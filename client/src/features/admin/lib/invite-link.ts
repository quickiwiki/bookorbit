import type { InviteLink } from '@bookorbit/types'

export type InviteLinkState = 'active' | 'revoked' | 'expired' | 'usedUp'

/** "482719305561" reads as "4827-1930-5561". */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}

export function inviteLinkUrl(code: string, origin: string): string {
  return `${origin}/join/${formatInviteCode(code)}`
}

export function inviteLinkState(link: InviteLink, now = Date.now()): InviteLinkState {
  if (link.revokedAt) return 'revoked'
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now) return 'expired'
  if (link.maxUses !== null && link.useCount >= link.maxUses) return 'usedUp'
  return 'active'
}
