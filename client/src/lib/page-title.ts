export const APP_TITLE = 'Book Reader Club'

export function formatPageTitle(leaf: string | null | undefined): string {
  const trimmed = (leaf ?? '').trim()
  if (!trimmed) return APP_TITLE
  return `${trimmed} · ${APP_TITLE}`
}
