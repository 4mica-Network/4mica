/** One row of the demo Actor's dataset: the two fields a reader needs at a glance. */
export interface DatasetItem {
  title: string
  url: string
}

/** The dataset a run for `query` produces. Deterministic, and no network involved. */
export function fakeDataset(query: string, count = 5): DatasetItem[] {
  const topic = query.trim() || 'untitled'
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1
    return {
      title: `${topic}: result ${n}`,
      url: `https://example.com/${slug || 'untitled'}/${n}`,
    }
  })
}

/** The dataset as a short list, one row per line, for a tool result's text. */
export function listDataset(items: DatasetItem[]): string {
  const rows = items.map((item, index) => `${index + 1}. ${item.title}  ${item.url}`)
  return [`${items.length} result${items.length === 1 ? '' : 's'}:`, ...rows].join('\n')
}

/** Stand in for the Actor's run time so the recording has a visible "running" phase. */
export function simulateRun(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000))
}
