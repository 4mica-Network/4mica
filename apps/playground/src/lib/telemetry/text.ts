export const FILTERED = "[Filtered]";
export const TRUNCATED = "[Truncated]";

export const MAX_SCRUB_INPUT_LENGTH = 65_536;
export const MAX_STRING_LENGTH = 8192;

const SENSITIVE_PAIR =
  /\b([\w.-]*(?:authorization|cookie|passw(?:or)?d?|secret|token|session|api[-_]?key|signature|handshake|credential|private[-_]?key|dsn)[\w.-]*)(\s*[=:]\s*)((?:(?:Bearer|Basic|Digest|Token|Negotiate)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;&"'}]+))/gi;

const TEXT_PATTERNS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9$]{8,}/g,
  /\bsntry[su]_[A-Za-z0-9_=+/-]{8,}/g,
  /\bwhsec_[A-Za-z0-9+/=]{8,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b0x[0-9a-fA-F]{64}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
];

const OAUTH_PAIR =
  /\b((?:code|state|nonce|otp|ticket|grant|id_token|access_token|refresh_token|client_secret|code_verifier)=)[^\s&"'<>#]+/gi;

const ENCODED_QUERY = /%3[Ff][^\s"'<>]*?%3[Dd][^\s"'<>]*/g;

const RELATIVE_URL =
  /(?<![\w/.:%-])[\w.~%-]+(?:\/[\w.~%-]*)*\?[^\s"'<>?]*=[^\s"'<>]*/g;

const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi;

const EMBEDDED_URL = /(?:\bhttps?:\/\/|(?<![\w/])\/)[^\s"'<>]*[?#][^\s"'<>]*/g;

const HIGH_ENTROPY = /(?<![\w-])[A-Za-z0-9_-]{40,}(?![\w-])/g;

const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const scrubUrl = (raw: string): string => {
  const cut = raw.search(/[?#]/);

  if (cut === -1) {
    return raw;
  }

  const base = raw.slice(0, cut);
  const hasQuery =
    raw[cut] === "?" && raw.length > cut + 1 && raw[cut + 1] !== "#";

  return hasQuery ? `${base}?${FILTERED}` : base;
};

const isHighEntropy = (token: string) =>
  !WALLET_ADDRESS.test(token) && /[A-Za-z]/.test(token) && /\d/.test(token);

const redactText = (text: string): string => {
  let result = text.replace(URL_CREDENTIALS, `$1${FILTERED}@`);
  result = result.replace(EMBEDDED_URL, (url) => scrubUrl(url));
  result = result.replace(RELATIVE_URL, (url) => scrubUrl(url));
  result = result.replace(ENCODED_QUERY, `%3F${FILTERED}`);

  for (const pattern of TEXT_PATTERNS) {
    result = result.replace(pattern, FILTERED);
  }

  result = result.replace(OAUTH_PAIR, `$1${FILTERED}`);
  result = result.replace(SENSITIVE_PAIR, `$1$2${FILTERED}`);

  return result.replace(HIGH_ENTROPY, (token) =>
    isHighEntropy(token) ? FILTERED : token,
  );
};

export const scrubText = (text: string): string => {
  if (text.length > MAX_SCRUB_INPUT_LENGTH) {
    return TRUNCATED;
  }

  const redacted = redactText(text);

  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}…${TRUNCATED}`
    : redacted;
};

export const safeStringify = (value: unknown): string => {
  try {
    return (
      JSON.stringify(value, (_key, item) =>
        typeof item === "bigint" ? item.toString() : item,
      ) ?? String(value)
    );
  } catch {
    return TRUNCATED;
  }
};
