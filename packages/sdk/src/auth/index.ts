import type { Account } from "viem";
import type {
  AuthNonceResponse,
  AuthTokens,
  SiweTemplate,
} from "@/auth/models";
import {
  AuthApiError,
  AuthConfigError,
  AuthDecodeError,
  AuthError,
  AuthMissingConfigError,
  AuthTransportError,
  AuthUrlError,
  SigningError,
} from "@/errors";
import { normalizeBaseUrl, requestJson } from "@/http";
import type { FetchFn } from "@/rpc";
import { isRecord, type RecordValue, readNumber, readString } from "@/serde";
import { ValidationError, validateUrl } from "@/utils";

export type {
  AuthNonceResponse,
  AuthTokens,
  SiweTemplate,
} from "@/auth/models";

const missingField = (label: string) =>
  new AuthDecodeError(`invalid auth response: missing ${label}`);

const parseTokens = (payload: RecordValue): AuthTokens => {
  const accessToken = readString(
    payload.access_token ?? payload.accessToken,
    "access_token",
    missingField,
  );
  const refreshToken = readString(
    payload.refresh_token ?? payload.refreshToken,
    "refresh_token",
    missingField,
  );
  const expiresIn = readNumber(
    payload.expires_in ?? payload.expiresIn,
    "expires_in",
    missingField,
  );
  return { accessToken, refreshToken, expiresIn };
};

const parseSiweTemplate = (payload: RecordValue): SiweTemplate => {
  const domain = readString(payload.domain, "siwe.domain", missingField);
  const uri = readString(payload.uri, "siwe.uri", missingField);
  const chainId = readNumber(
    payload.chain_id ?? payload.chainId,
    "siwe.chain_id",
    missingField,
  );
  const statement = readString(
    payload.statement,
    "siwe.statement",
    missingField,
  );
  const expiration = readString(
    payload.expiration,
    "siwe.expiration",
    missingField,
  );
  const issuedAt = readString(
    payload.issued_at ?? payload.issuedAt,
    "siwe.issued_at",
    missingField,
  );
  return { domain, uri, chainId, statement, expiration, issuedAt };
};

const parseNonceResponse = (payload: unknown): AuthNonceResponse => {
  if (!isRecord(payload)) {
    throw new AuthDecodeError("invalid auth response: nonce payload");
  }
  const nonce = readString(payload.nonce, "nonce", missingField);
  if (!isRecord(payload.siwe)) {
    throw new AuthDecodeError("invalid auth response: missing siwe template");
  }
  return { nonce, siwe: parseSiweTemplate(payload.siwe) };
};

export function buildSiweMessage(input: {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: number | string;
  nonce: string;
  issuedAt: string;
  expiration: string;
}): string {
  const chainId = String(input.chainId);
  return `${input.domain} wants you to sign in with your Ethereum account:\n${input.address}\n\n${input.statement}\n\nURI: ${input.uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt}\nExpiration Time: ${input.expiration}`;
}

export class AuthClient {
  private baseUrl: string;
  private fetchFn: FetchFn;

  constructor(endpoint: string, fetchFn: FetchFn = fetch) {
    try {
      const validated = validateUrl(endpoint);
      this.baseUrl = normalizeBaseUrl(validated);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new AuthUrlError(err.message);
      }
      throw err;
    }
    this.fetchFn = fetchFn;
  }

  async getNonce(address: string): Promise<AuthNonceResponse> {
    const payload = await this.post("/auth/nonce", { address });
    return parseNonceResponse(payload);
  }

  async verify(
    address: string,
    message: string,
    signature: string,
  ): Promise<AuthTokens> {
    const payload = await this.post("/auth/verify", {
      address,
      message,
      signature,
    });
    if (!isRecord(payload)) {
      throw new AuthDecodeError("invalid auth response: verify payload");
    }
    return parseTokens(payload);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.post("/auth/refresh", {
      refresh_token: refreshToken,
    });
    if (!isRecord(payload)) {
      throw new AuthDecodeError("invalid auth response: refresh payload");
    }
    return parseTokens(payload);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.post("/auth/logout", { refresh_token: refreshToken });
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    try {
      return await requestJson<unknown>(
        this.fetchFn,
        `${this.baseUrl}${path}`,
        init,
        {
          decodeError: (message) => new AuthDecodeError(message),
          httpError: (message, response, body) =>
            new AuthApiError(message, {
              status: response.status,
              body,
            }),
          allowEmptyOk: true,
        },
      );
    } catch (err) {
      if (err instanceof AuthError) {
        throw err;
      }
      throw new AuthTransportError(`auth request failed: ${String(err)}`);
    }
  }
}

export class AuthSession {
  private authClient: AuthClient;
  private signer: Account;
  private refreshMarginSecs: number;
  private tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  private inFlight?: Promise<string>;
  private loginPromise?: Promise<AuthTokens>;

  constructor(options: {
    authUrl: string;
    signer: Account;
    refreshMarginSecs?: number;
    fetchFn?: FetchFn;
  }) {
    if (!options.authUrl) {
      throw new AuthMissingConfigError("missing auth_url");
    }
    this.authClient = new AuthClient(options.authUrl, options.fetchFn);
    this.signer = options.signer;

    const margin = options.refreshMarginSecs ?? 60;
    if (!Number.isFinite(margin) || margin < 0) {
      throw new AuthConfigError("refresh margin must be non-negative");
    }
    this.refreshMarginSecs = margin;
  }

  async accessToken(): Promise<string> {
    if (this.tokens && !this.isExpiringSoon()) {
      return this.tokens.accessToken;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.refreshOrLogin();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  async login(): Promise<AuthTokens> {
    if (this.loginPromise) {
      return this.loginPromise;
    }
    this.loginPromise = this.performLogin();
    try {
      return await this.loginPromise;
    } finally {
      this.loginPromise = undefined;
    }
  }

  async logout(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      return;
    }
    await this.authClient.logout(this.tokens.refreshToken);
    this.tokens = undefined;
  }

  private async refreshOrLogin(): Promise<string> {
    if (this.tokens?.refreshToken) {
      try {
        const tokens = await this.refreshTokens();
        return tokens.accessToken;
      } catch (err) {
        if (err instanceof AuthApiError && err.status === 401) {
          const tokens = await this.login();
          return tokens.accessToken;
        }
        throw err;
      }
    }
    const tokens = await this.login();
    return tokens.accessToken;
  }

  private async performLogin(): Promise<AuthTokens> {
    const address = this.signer.address;
    const nonce = await this.authClient.getNonce(address);
    const message = buildSiweMessage({
      domain: nonce.siwe.domain,
      address,
      statement: nonce.siwe.statement,
      uri: nonce.siwe.uri,
      chainId: nonce.siwe.chainId,
      nonce: nonce.nonce,
      issuedAt: nonce.siwe.issuedAt,
      expiration: nonce.siwe.expiration,
    });
    if (!this.signer.signMessage) {
      throw new SigningError("signMessage is not supported for this account");
    }
    const signature = await this.signer.signMessage({ message });
    const tokens = await this.authClient.verify(address, message, signature);
    this.cacheTokens(tokens);
    return tokens;
  }

  private async refreshTokens(): Promise<AuthTokens> {
    if (!this.tokens?.refreshToken) {
      throw new AuthMissingConfigError("missing refresh token");
    }
    const tokens = await this.authClient.refresh(this.tokens.refreshToken);
    this.cacheTokens(tokens);
    return tokens;
  }

  private cacheTokens(tokens: AuthTokens): void {
    const now = Date.now() / 1000;
    this.tokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: now + tokens.expiresIn,
    };
  }

  private isExpiringSoon(): boolean {
    if (!this.tokens) {
      return true;
    }
    const now = Date.now() / 1000;
    return now + this.refreshMarginSecs >= this.tokens.expiresAt;
  }
}
