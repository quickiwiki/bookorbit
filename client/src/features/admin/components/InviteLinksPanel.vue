<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Copy, Link2, Plus, Trash2 } from '@lucide/vue'
import type { InviteLink } from '@bookorbit/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate, formatNumber } from '@/i18n/formatters'
import { copyToClipboard } from '@/lib/clipboard'
import { useInviteLinks } from '../composables/useInviteLinks'
import { formatInviteCode, inviteLinkState, inviteLinkUrl, type InviteLinkState } from '../lib/invite-link'
import StatusPill from './StatusPill.vue'

const USE_OPTIONS = [1, 5, 25, 0]
const EXPIRY_OPTIONS = [1, 7, 30, 0]

const { t } = useI18n()
const { links, loading, error, load, create, revoke } = useInviteLinks()

const label = ref('')
const maxUses = ref(1)
const expiresInDays = ref(7)
const creating = ref(false)
const copiedId = ref<number | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

onMounted(load)
onUnmounted(() => clearTimeout(copiedTimer))

const stateTone: Record<InviteLinkState, 'success' | 'neutral' | 'warning'> = {
  active: 'success',
  revoked: 'neutral',
  expired: 'neutral',
  usedUp: 'warning',
}

function urlFor(link: InviteLink) {
  return inviteLinkUrl(link.code, window.location.origin)
}

async function copyLink(link: InviteLink) {
  if (!(await copyToClipboard(urlFor(link)))) return
  copiedId.value = link.id
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copiedId.value = null), 2000)
}

async function handleCreate() {
  creating.value = true
  try {
    const link = await create({
      label: label.value.trim() || undefined,
      maxUses: maxUses.value || undefined,
      expiresInDays: expiresInDays.value || undefined,
    })
    if (link) {
      label.value = ''
      await copyLink(link)
    }
  } finally {
    creating.value = false
  }
}

function usesText(link: InviteLink) {
  return link.maxUses === null
    ? t('adminFeature.usersPage.invites.usesUnlimited', { used: formatNumber(link.useCount) })
    : t('adminFeature.usersPage.invites.uses', { used: formatNumber(link.useCount), max: formatNumber(link.maxUses) })
}

function expiryText(link: InviteLink) {
  return link.expiresAt
    ? t('adminFeature.usersPage.invites.expires', { date: formatDate(new Date(link.expiresAt)) })
    : t('adminFeature.usersPage.invites.noExpiry')
}
</script>

<template>
  <section aria-labelledby="invite-links-heading" class="border-t border-border/70 pt-5">
    <div class="mb-3 flex items-center gap-3">
      <h3 id="invite-links-heading" class="settings-group-label mb-0">{{ t('adminFeature.usersPage.invites.title') }}</h3>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>

    <div class="rounded-lg border border-border bg-card shadow-xs">
      <div class="p-4">
        <p class="settings-hint">{{ t('adminFeature.usersPage.invites.hint') }}</p>
        <form class="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" @submit.prevent="handleCreate">
          <Input
            v-model="label"
            class="h-9"
            :maxlength="100"
            :placeholder="t('adminFeature.usersPage.invites.labelPlaceholder')"
            :aria-label="t('adminFeature.usersPage.invites.label')"
          />
          <select
            v-model.number="maxUses"
            class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            :aria-label="t('adminFeature.usersPage.invites.maxUses')"
          >
            <option v-for="option in USE_OPTIONS" :key="option" :value="option">
              {{
                option ? t('adminFeature.usersPage.invites.usesOption', { count: option }) : t('adminFeature.usersPage.invites.usesOptionUnlimited')
              }}
            </option>
          </select>
          <select
            v-model.number="expiresInDays"
            class="h-9 rounded-md border border-input bg-background px-3 text-sm"
            :aria-label="t('adminFeature.usersPage.invites.expiry')"
          >
            <option v-for="option in EXPIRY_OPTIONS" :key="option" :value="option">
              {{ option ? t('adminFeature.usersPage.invites.expiryOption', { count: option }) : t('adminFeature.usersPage.invites.noExpiry') }}
            </option>
          </select>
          <Button type="submit" size="sm" class="h-9" :disabled="creating">
            <Plus :size="14" aria-hidden="true" />
            {{ t('adminFeature.usersPage.invites.create') }}
          </Button>
        </form>
        <p v-if="error" role="alert" class="mt-2 text-sm text-destructive">{{ t(`adminFeature.usersPage.invites.errors.${error}`) }}</p>
      </div>

      <p v-if="!loading && links.length === 0" class="border-t border-border px-4 py-4 text-sm text-muted-foreground">
        {{ t('adminFeature.usersPage.invites.empty') }}
      </p>
      <ul v-else class="divide-y divide-border border-t border-border">
        <li v-for="link in links" :key="link.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" data-testid="invite-link-row">
          <Link2 :size="15" class="shrink-0 text-muted-foreground" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-sm">
              <span class="font-mono font-medium tracking-wide">{{ formatInviteCode(link.code) }}</span>
              <span v-if="link.label" class="truncate text-muted-foreground">{{ link.label }}</span>
              <StatusPill :tone="stateTone[inviteLinkState(link)]">{{
                t(`adminFeature.usersPage.invites.state.${inviteLinkState(link)}`)
              }}</StatusPill>
            </p>
            <p class="text-xs text-muted-foreground">{{ usesText(link) }} · {{ expiryText(link) }}</p>
          </div>
          <template v-if="inviteLinkState(link) === 'active'">
            <Button variant="outline" size="sm" type="button" :title="urlFor(link)" @click="copyLink(link)">
              <Check v-if="copiedId === link.id" :size="14" aria-hidden="true" />
              <Copy v-else :size="14" aria-hidden="true" />
              {{ copiedId === link.id ? t('adminFeature.usersPage.invites.copied') : t('adminFeature.usersPage.invites.copy') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              :aria-label="t('adminFeature.usersPage.invites.revoke')"
              :title="t('adminFeature.usersPage.invites.revoke')"
              @click="revoke(link.id)"
            >
              <Trash2 :size="14" aria-hidden="true" />
            </Button>
          </template>
        </li>
      </ul>
    </div>
  </section>
</template>
