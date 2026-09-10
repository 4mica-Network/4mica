/** One row of the demo Actor's dataset, shaped like `apify/rag-web-browser` output. */
export interface DatasetItem {
  title: string
  url: string
  description: string
  markdown: string
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
      description: `Page ${n} of ${count} the demo scraper found for "${topic}".`,
      markdown: `# ${topic}\n\nResult ${n} of ${count}. Scraped by the demo Actor.\n`,
    }
  })
}

/** Stand in for the Actor's run time so the recording has a visible "running" phase. */
export function simulateRun(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000))
}
