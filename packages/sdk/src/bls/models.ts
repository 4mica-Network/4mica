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

export type BlsModule = {
  bls12_381: {
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
