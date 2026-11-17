import { ref } from 'vue'
import type { InviteLink } from '@bookorbit/types'
import { api } from '@/lib/api'

export interface NewInviteLink {
  label?: string
  maxUses?: number
  expiresInDays?: number
}

export function useInviteLinks() {
  const links = ref<InviteLink[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await api('/api/v1/auth/invites')
      if (!res.ok) throw new Error('load')
      links.value = await res.json()
    } catch {
      error.value = 'load'
    } finally {
      loading.value = false
    }
  }

  async function create(data: NewInviteLink): Promise<InviteLink | null> {
    error.value = null
    const res = await api('/api/v1/auth/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => null)
    if (!res?.ok) {
      error.value = 'create'
      return null
    }
    const link: InviteLink = await res.json()
    links.value = [link, ...links.value]
    return link
  }

  async function revoke(id: number) {
    error.value = null
    const res = await api(`/api/v1/auth/invites/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      error.value = 'revoke'
      return
    }
    const revokedAt = new Date().toISOString()
    links.value = links.value.map((link) => (link.id === id ? { ...link, revokedAt } : link))
  }

  return { links, loading, error, load, create, revoke }
}
