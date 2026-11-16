<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { BookA, KeyRound, Loader2, Trash2, Upload, Users } from '@lucide/vue'
import { Permission, type DictionarySource, type OxfordEnvironment } from '@bookorbit/types'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import { usePermissions } from '@/features/auth/composables/usePermissions'
import { dictionaryApi } from '@/features/vocabulary/composables/vocabularyApi'
import { errorMessage } from '@/lib/api-json'
import { formatNumber } from '@/i18n/formatters'
import { SECRET_INPUT_ATTRS } from '@/lib/secret-input'

const POLL_MS = 2000

const { t } = useI18n()
const { isDemoRestrictedAccount: readonly, hasPermission } = usePermissions()
const canShare = computed(() => hasPermission(Permission.ManageAppSettings))

const sources = ref<DictionarySource[]>([])
const loading = ref(true)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const showOxfordForm = ref(false)
const savingOxford = ref(false)
const pendingDelete = ref<DictionarySource | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const oxford = reactive({ name: 'Oxford', appId: '', appKey: '', environment: 'sandbox' as OxfordEnvironment, sourceLang: 'en', targetLang: '' })
const oxfordValid = computed(() => oxford.name.trim() && oxford.appId.trim() && oxford.appKey.trim() && oxford.sourceLang.trim())

async function load() {
  try {
    sources.value = await dictionaryApi.sources()
  } catch (error) {
    toast.error(errorMessage(error, 'dictionaries.errors.load'))
  } finally {
    loading.value = false
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void load()
  }, POLL_MS)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

onMounted(() => {
  void load()
})

onBeforeUnmount(stopPolling)

function languagePair(source: DictionarySource) {
  const from = source.sourceLang?.toUpperCase() ?? '?'
  return source.targetLang && source.targetLang !== source.sourceLang ? `${from} → ${source.targetLang.toUpperCase()}` : from
}

function kindLabel(source: DictionarySource) {
  return t(`dictionaries.kind.${source.kind}`)
}

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  uploading.value = true
  startPolling()
  try {
    const source = await dictionaryApi.upload(file)
    toast.success(t('dictionaries.toast.imported', { name: source.name, count: formatNumber(source.entryCount) }))
  } catch (error) {
    toast.error(errorMessage(error, 'dictionaries.errors.upload'))
  } finally {
    uploading.value = false
    stopPolling()
    await load()
  }
}

function handleShowOxford() {
  showOxfordForm.value = true
}

function handleCancelOxford() {
  showOxfordForm.value = false
}

async function handleSaveOxford() {
  if (!oxfordValid.value) return
  savingOxford.value = true
  try {
    await dictionaryApi.createOxford({
      name: oxford.name.trim(),
      appId: oxford.appId.trim(),
      appKey: oxford.appKey.trim(),
      environment: oxford.environment,
      sourceLang: oxford.sourceLang.trim(),
      targetLang: oxford.targetLang.trim() || null,
    })
    oxford.appId = ''
    oxford.appKey = ''
    showOxfordForm.value = false
    await load()
  } catch (error) {
    toast.error(errorMessage(error, 'dictionaries.errors.save'))
  } finally {
    savingOxford.value = false
  }
}

async function toggleEnabled(source: DictionarySource, enabled: boolean) {
  try {
    const updated = await dictionaryApi.update(source.id, { enabled })
    sources.value = sources.value.map((s) => (s.id === updated.id ? updated : s))
  } catch (error) {
    toast.error(errorMessage(error, 'dictionaries.errors.save'))
  }
}

function canShareSource(source: DictionarySource) {
  return canShare.value && source.owned && source.kind !== 'oxford' && source.status === 'ready'
}

async function toggleShared(source: DictionarySource) {
  try {
    const updated = await dictionaryApi.setShared(source.id, { shared: !source.shared })
    sources.value = sources.value.map((s) => (s.id === updated.id ? updated : s))
    toast.success(t(updated.shared ? 'dictionaries.toast.shared' : 'dictionaries.toast.unshared', { name: updated.name }))
  } catch (error) {
    toast.error(errorMessage(error, 'dictionaries.errors.share'))
  }
}

function askDelete(source: DictionarySource) {
  pendingDelete.value = source
}

function handleCancelDelete() {
  pendingDelete.value = null
}

async function handleConfirmDelete() {
  const source = pendingDelete.value
  pendingDelete.value = null
  if (!source) return
  try {
    await dictionaryApi.remove(source.id)
    sources.value = sources.value.filter((s) => s.id !== source.id)
  } catch (error) {
    toast.error(errorMessage(error, 'dictionaries.errors.delete'))
  }
}

function handleEnvironmentChange(value: string | number) {
  oxford.environment = value as OxfordEnvironment
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <p class="text-sm text-muted-foreground max-w-2xl">{{ t('dictionaries.intro') }}</p>

    <div v-if="!readonly" class="flex flex-wrap gap-2">
      <Button size="sm" :disabled="uploading" data-testid="dictionaries-upload" @click="openFilePicker">
        <Loader2 v-if="uploading" :size="14" class="animate-spin" />
        <Upload v-else :size="14" />
        {{ uploading ? t('dictionaries.importing') : t('dictionaries.upload') }}
      </Button>
      <Button size="sm" variant="outline" :disabled="showOxfordForm" @click="handleShowOxford">
        <KeyRound :size="14" />
        {{ t('dictionaries.addOxford') }}
      </Button>
      <input ref="fileInput" type="file" accept=".dsl,.dz,.tsv,.tab,.txt,.gz" class="hidden" @change="handleFileChange" />
    </div>

    <form v-if="showOxfordForm" class="rounded-lg border border-border bg-card p-4 space-y-3 max-w-2xl" @submit.prevent="handleSaveOxford">
      <div>
        <h3 class="font-medium text-foreground">{{ t('dictionaries.oxford.title') }}</h3>
        <p class="text-xs text-muted-foreground">{{ t('dictionaries.oxford.help') }}</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1 text-sm">
          <span class="text-muted-foreground">{{ t('dictionaries.oxford.name') }}</span>
          <Input v-model="oxford.name" maxlength="200" />
        </label>
        <label class="space-y-1 text-sm">
          <span class="text-muted-foreground">{{ t('dictionaries.oxford.environment') }}</span>
          <Select :modelValue="oxford.environment" @update:modelValue="handleEnvironmentChange">
            <option value="sandbox">{{ t('dictionaries.oxford.sandbox') }}</option>
            <option value="production">{{ t('dictionaries.oxford.production') }}</option>
          </Select>
        </label>
        <label class="space-y-1 text-sm">
          <span class="text-muted-foreground">{{ t('dictionaries.oxford.appId') }}</span>
          <Input v-model="oxford.appId" autocomplete="off" maxlength="200" />
        </label>
        <label class="space-y-1 text-sm">
          <span class="text-muted-foreground">{{ t('dictionaries.oxford.appKey') }}</span>
          <Input v-model="oxford.appKey" v-bind="SECRET_INPUT_ATTRS" type="text" class="input-secret" maxlength="200" />
        </label>
        <label class="space-y-1 text-sm">
          <span class="text-muted-foreground">{{ t('dictionaries.oxford.sourceLang') }}</span>
          <Input v-model="oxford.sourceLang" placeholder="en" maxlength="10" />
        </label>
        <label class="space-y-1 text-sm">
          <span class="text-muted-foreground">{{ t('dictionaries.oxford.targetLang') }}</span>
          <Input v-model="oxford.targetLang" :placeholder="t('dictionaries.oxford.targetLangPlaceholder')" maxlength="10" />
        </label>
      </div>
      <div class="flex gap-2">
        <Button type="submit" size="sm" :disabled="!oxfordValid || savingOxford">{{ t('common.save') }}</Button>
        <Button type="button" size="sm" variant="ghost" @click="handleCancelOxford">{{ t('common.cancel') }}</Button>
      </div>
    </form>

    <div v-if="loading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</div>

    <div
      v-else-if="sources.length === 0"
      class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center max-w-2xl"
    >
      <BookA :size="26" class="text-muted-foreground" />
      <p class="font-medium text-foreground">{{ t('dictionaries.empty.title') }}</p>
      <p class="text-sm text-muted-foreground max-w-md">{{ t('dictionaries.empty.hint') }}</p>
    </div>

    <ul v-else class="rounded-lg border border-border bg-card divide-y divide-border max-w-2xl">
      <li v-for="source in sources" :key="source.id" class="flex items-center gap-3 px-4 py-3" :data-testid="`dictionary-source-${source.id}`">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-foreground truncate">{{ source.name }}</span>
            <span class="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{{ kindLabel(source) }}</span>
            <span class="text-[11px] text-muted-foreground">{{ languagePair(source) }}</span>
            <span v-if="source.shared" class="inline-flex items-center gap-1 text-[11px] rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              <Users :size="11" />
              {{ source.owned ? t('dictionaries.sharedWithEveryone') : t('dictionaries.sharedBy', { name: source.ownerName ?? '' }) }}
            </span>
          </div>
          <p v-if="source.status === 'importing'" class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 :size="12" class="animate-spin" />
            {{ t('dictionaries.status.importing', { count: formatNumber(source.entryCount) }) }}
          </p>
          <p v-else-if="source.status === 'failed'" class="text-xs text-destructive">{{ source.error ?? t('dictionaries.status.failed') }}</p>
          <p v-else-if="source.kind !== 'oxford'" class="text-xs text-muted-foreground">
            {{ t('dictionaries.status.entries', { count: formatNumber(source.entryCount) }) }}
          </p>
          <p v-else class="text-xs text-muted-foreground">
            {{ source.oxfordEnvironment === 'production' ? t('dictionaries.oxford.production') : t('dictionaries.oxford.sandbox') }}
          </p>
        </div>
        <Button
          v-if="canShareSource(source)"
          variant="ghost"
          size="sm"
          :aria-pressed="source.shared"
          :title="t('dictionaries.shareHint')"
          :data-testid="`dictionary-share-${source.id}`"
          @click="toggleShared(source)"
        >
          <Users :size="14" />
          {{ source.shared ? t('dictionaries.unshare') : t('dictionaries.share') }}
        </Button>
        <ToggleSwitch
          v-if="source.owned && source.status === 'ready'"
          :modelValue="source.enabled"
          :disabled="readonly"
          :aria-label="t('dictionaries.enabled')"
          @update:modelValue="toggleEnabled(source, $event)"
        />
        <Button
          v-if="!readonly && source.owned && source.status !== 'importing'"
          variant="destructive-ghost"
          size="icon-sm"
          :aria-label="t('dictionaries.delete')"
          @click="askDelete(source)"
        >
          <Trash2 :size="14" />
        </Button>
      </li>
    </ul>

    <ConfirmDialog
      :open="pendingDelete !== null"
      :title="t('dictionaries.deleteTitle')"
      :description="t('dictionaries.deleteDescription', { name: pendingDelete?.name ?? '' })"
      :confirmLabel="t('dictionaries.delete')"
      destructive
      @confirm="handleConfirmDelete"
      @cancel="handleCancelDelete"
    />
  </div>
</template>
