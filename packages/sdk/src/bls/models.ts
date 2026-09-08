export type BlsField =
  | { value?: string | number | bigint }
  | string
  | number
  | bigint;

export type BlsSignatureInput =
  | string
  | Uint8Array
  | ArrayBuffer
  | ArrayLike<number>
  | { type?: string; data?: number[] }
  | { bytes?: unknown }
  | { signature?: unknown };

export type BlsLongSignatures = {
  hash(message: Uint8Array, DST?: string): unknown;
  verify(signature: unknown, message: unknown, publicKey: unknown): boolean;
};

export type BlsModule = {
  bls12_381: {
    longSignatures?: BlsLongSignatures;
    G1?: {
      ProjectivePoint?: { fromHex(bytes: Uint8Array | string): unknown };
      Point?: { fromHex(bytes: Uint8Array | string): unknown };
    };
    G2: {
      ProjectivePoint?: {
        fromHex(bytes: Uint8Array | string): {
          toAffine(): {
            x: {
              c?: readonly [BlsField, BlsField];
              c0?: BlsField;
              c1?: BlsField;
            };
            y: {
              c?: readonly [BlsField, BlsField];
              c0?: BlsField;
              c1?: BlsField;
            };
          };
        };
      };
      Point?: {
        fromHex(bytes: Uint8Array | string): {
          toAffine(): {
            x: {
              c?: readonly [BlsField, BlsField];
              c0?: BlsField;
              c1?: BlsField;
            };
            y: {
              c?: readonly [BlsField, BlsField];
              c0?: BlsField;
              c1?: BlsField;
            };
          };
        };
      };
    };
  };
};
