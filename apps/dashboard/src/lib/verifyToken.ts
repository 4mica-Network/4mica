const PARAM = "verifyToken";
const STORAGE_KEY = "4mica.verifyToken";

let memoryToken: string | null = null;

const store = (token: string) => {
  memoryToken = token;
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {}
};

export function captureVerifyToken(): void {
  const { pathname, search, hash } = window.location;
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const token = fragment.get(PARAM) ?? query.get(PARAM);

  if (!fragment.has(PARAM) && !query.has(PARAM)) {
    return;
  }

  query.delete(PARAM);
  fragment.delete(PARAM);
  const nextSearch = query.toString();
  const nextHash = fragment.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash ? `#${nextHash}` : ""}`,
  );

  if (token) {
    store(token);
  }
}

export function readVerifyToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function clearVerifyToken(): void {
  memoryToken = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
