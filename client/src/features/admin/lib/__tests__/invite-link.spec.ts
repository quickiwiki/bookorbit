import { describe, expect, it } from 'vitest'
import type { InviteLink } from '@bookorbit/types'
import { formatInviteCode, inviteLinkState, inviteLinkUrl } from '../invite-link'

function link(overrides: Partial<InviteLink> = {}): InviteLink {
  return {
    id: 1,
    code: '482719305561',
    label: '',
    maxUses: null,
    useCount: 0,
    expiresAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    revokedAt: null,
    createdByUsername: null,
    ...overrides,
  }
}

describe('invite links', () => {
  it('show the code in groups of four', () => {
    expect(formatInviteCode('482719305561')).toBe('4827-1930-5561')
    expect(inviteLinkUrl('482719305561', 'https://bookclub.cafe')).toBe('https://bookclub.cafe/join/4827-1930-5561')
  })

  it('tell whether a link can still be used', () => {
    const now = Date.parse('2026-11-17T00:00:00Z')
    expect(inviteLinkState(link(), now)).toBe('active')
    expect(inviteLinkState(link({ revokedAt: '2026-11-02T00:00:00Z' }), now)).toBe('revoked')
    expect(inviteLinkState(link({ expiresAt: '2026-11-10T00:00:00Z' }), now)).toBe('expired')
    expect(inviteLinkState(link({ maxUses: 2, useCount: 2 }), now)).toBe('usedUp')
    expect(inviteLinkState(link({ maxUses: 2, useCount: 1 }), now)).toBe('active')
  })
})
