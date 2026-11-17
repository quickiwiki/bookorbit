import { ref } from 'vue'
import type { InviteLinkStatus } from '@bookorbit/types'

export type InviteCheck = 'checking' | 'valid' | 'invalid' | 'unknown'

export function useInviteStatus() {
  const status = ref<InviteCheck>('checking')

  async function check(code: string) {
    status.value = 'checking'
    try {
      const res = await fetch(`/api/v1/auth/invites/${encodeURIComponent(code)}/status`)
      if (!res.ok) {
        // A rate limit or outage says nothing about the link; let the sign-up itself decide.
        status.value = 'unknown'
        return
      }
      const body: InviteLinkStatus = await res.json()
      status.value = body.valid ? 'valid' : 'invalid'
    } catch {
      status.value = 'unknown'
    }
  }

  return { status, check }
}
