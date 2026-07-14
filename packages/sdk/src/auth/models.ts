export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type SiweTemplate = {
  domain: string;
  uri: string;
  chainId: number;
  statement: string;
  expiration: string;
  issuedAt: string;
};

export type AuthNonceResponse = {
  nonce: string;
  siwe: SiweTemplate;
};
