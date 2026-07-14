/**
 * Edge-safe base64 helpers.
 *
 * Uses only Web-standard `atob`/`btoa` + `TextEncoder`/`TextDecoder`, which are
 * available on Node (>=16), Bun, Deno, browsers, and edge/worker runtimes — so
 * the server paywall path never depends on Node's `Buffer`.
 */

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

export function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}
