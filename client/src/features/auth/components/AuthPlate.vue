<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PublicLegalNotices from '@/components/legal/PublicLegalNotices.vue'
import { useEndpaper } from '../composables/useEndpaper'
import AuthAppearanceToolbar from './AuthAppearanceToolbar.vue'
import AuthEndpaper from './AuthEndpaper.vue'
import readingRoom from '@/assets/login/reading-room.webp'
import readingRoomSmall from '@/assets/login/reading-room-800.webp'

withDefaults(defineProps<{ heading: string; description?: string; wide?: boolean }>(), { description: undefined, wide: false })

const { t } = useI18n()
const { endpaper } = useEndpaper()
</script>

<template>
  <div class="flex min-h-svh flex-col lg:flex-row">
    <figure class="auth-photo relative h-52 shrink-0 overflow-hidden sm:h-64 lg:sticky lg:top-0 lg:h-svh lg:w-1/2 xl:w-[55%]">
      <img
        :src="readingRoom"
        :srcset="`${readingRoomSmall} 800w, ${readingRoom} 1600w`"
        sizes="(min-width: 1024px) 55vw, 100vw"
        :alt="t('auth.photo.alt')"
        class="absolute inset-0 size-full object-cover"
        fetchpriority="high"
      />
      <div class="auth-photo-shade absolute inset-0" aria-hidden="true" />
      <figcaption class="absolute inset-x-0 bottom-0 px-5 pb-4 text-white sm:px-8 sm:pb-6 lg:px-12 lg:pb-10">
        <p class="hidden max-w-md font-serif text-3xl leading-tight italic lg:block">{{ t('auth.photo.tagline') }}</p>
        <p class="text-[0.6875rem] leading-4 text-white/75 lg:mt-4">
          {{ t('auth.photo.credit') }}
          <a
            href="https://commons.wikimedia.org/wiki/File:The_John_Rylands_Library_Reading_Room_Enclave_(49394581623).jpg"
            target="_blank"
            rel="noopener noreferrer"
            class="underline decoration-white/40 underline-offset-2 hover:decoration-white"
            >{{ t('auth.photo.source') }}</a
          >
        </p>
      </figcaption>
    </figure>

    <AuthEndpaper
      :pattern="endpaper"
      class="flex flex-1 flex-col items-center px-3 pt-[4.25rem] pb-6 sm:justify-center sm:px-4 sm:pt-20 lg:min-h-svh"
    >
      <AuthAppearanceToolbar />

      <section
        class="auth-plate relative w-full rounded-[3px] bg-(--plate) p-2 sm:p-3"
        :class="wide ? 'max-w-[32.5rem]' : 'max-w-[28rem]'"
        aria-labelledby="auth-plate-heading"
      >
        <div class="auth-frame relative px-5 pt-6 pb-5 sm:px-10 sm:pt-[2.125rem] sm:pb-[1.875rem]">
          <header class="mb-[1.625rem] text-center">
            <p class="auth-ex flex items-center justify-center gap-3.5 font-serif text-xs font-semibold uppercase text-primary">
              <span>{{ t('auth.plate.exLibris') }}</span>
            </p>
            <p
              class="mt-3.5 font-serif text-[2.125rem] leading-10 font-medium italic tracking-[-0.01em] text-foreground sm:text-[2.5rem] sm:leading-[2.875rem]"
            >
              Book Reader<span class="text-primary"> Club</span>
            </p>
            <p class="mt-3.5 mb-3 flex items-center justify-center gap-2" aria-hidden="true">
              <span class="h-px w-[3.375rem] bg-(--plate-rule)" />
              <span class="size-1.5 rotate-45 bg-primary" />
              <span class="h-px w-[3.375rem] bg-(--plate-rule)" />
            </p>
            <h1 id="auth-plate-heading" class="font-serif text-base leading-[1.375rem] font-normal italic text-muted-foreground">{{ heading }}</h1>
            <p v-if="description" class="mt-1 text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{{ description }}</p>
          </header>

          <slot />
        </div>
      </section>

      <PublicLegalNotices class="mt-5 rounded-full bg-background/85 px-3 py-1" />
    </AuthEndpaper>
  </div>
</template>

<style scoped>
.auth-photo-shade {
  background: linear-gradient(to top, rgb(0 0 0 / 0.72), rgb(0 0 0 / 0.15) 45%, transparent 70%);
}

.auth-plate {
  box-shadow:
    0 0 0 1px color-mix(in oklch, var(--foreground) 8%, transparent),
    0 1px 1px color-mix(in oklch, black 14%, transparent),
    0 26px 50px -24px color-mix(in oklch, black 45%, transparent);
}

/* A thick-and-thin rule with a square at each inner corner, as on a printed bookplate. */
.auth-frame {
  --sq: linear-gradient(var(--plate-rule), var(--plate-rule));
  border: 2.5px solid var(--plate-rule);
  outline: 1px solid var(--plate-rule);
  outline-offset: -7px;
  background:
    var(--sq) 3px 3px / 6px 6px no-repeat,
    var(--sq) calc(100% - 3px) 3px / 6px 6px no-repeat,
    var(--sq) 3px calc(100% - 3px) / 6px 6px no-repeat,
    var(--sq) calc(100% - 3px) calc(100% - 3px) / 6px 6px no-repeat;
}

.auth-ex {
  letter-spacing: 0.34em;
}

.auth-ex span {
  margin-inline-end: -0.34em;
}

.auth-ex::before,
.auth-ex::after {
  content: '';
  width: 2.25rem;
  height: 1px;
  background: currentColor;
}

@media (min-width: 40rem) {
  .auth-frame {
    outline-offset: -8px;
  }
}
</style>
