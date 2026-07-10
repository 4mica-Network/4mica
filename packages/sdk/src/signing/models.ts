export type GuaranteeTypedDataValidationOptions = {
  expectedChainId?: number;
  expectedSigner?: string;
  expectedRecipient?: string;
};

export type GuaranteeSigningContextOptions = {
  signerAddress?: string;
  signerChainId?: number;
};
