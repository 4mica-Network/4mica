const RELOAD_KEY = "4mica.chunkReloadAt";
const RELOAD_WINDOW_MS = 10_000;

const CHUNK_FAILURE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (CSS )?chunk [\w-]+ failed/i;

export const isChunkLoadError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "ChunkLoadError" || CHUNK_FAILURE.test(error.message));

export function reloadForNewVersion(now = Date.now()): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    return false;
  }
  if (now - last < RELOAD_WINDOW_MS) {
    return false;
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
