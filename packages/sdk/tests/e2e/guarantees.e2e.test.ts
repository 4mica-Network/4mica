import type { FourMicaFacilitatorClient } from "@4mica/x402/server";
import { keccak256 } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@/index";
import type {
  X402PaymentEnvelopeV1,
  X402PaymentEnvelopeV2,
  X402PaymentRequired,
} from "@/x402";
import {
  clientAddress,
  describeE2E,
  ETH_ASSET,
  ETH_DECIMALS,
  envNumber,
  FacilitatorX402Flow,
  getSupportedStablecoins,
  issueGuaranteeViaFacilitator,
  makeFacilitatorClient,
  makePayerClient,
  makeRecipientClient,
  resolveGuaranteeAmount,
  resolveTabTtl,
  resolveV2GuaranteeAmount,
  toHex,
} from "./setup";

describeE2E("Guarantees", () => {
  let payerClient: Client;
  let recipientClient: Client;
  let facilitatorClient: FourMicaFacilitatorClient;
  let facilitatorFlow: FacilitatorX402Flow;
  let network: string;
  let payerAddress: `0x${string}`;
  let recipientAddress: `0x${string}`;

  beforeAll(async () => {
    [payerClient, recipientClient] = await Promise.all([
      makePayerClient(),
      makeRecipientClient(),
    ]);
    facilitatorClient = makeFacilitatorClient();
    facilitatorFlow = new FacilitatorX402Flow(
      payerClient.user,
      facilitatorClient,
    );
    network = `eip155:${payerClient.params.chainId}`;
    payerAddress = clientAddress(payerClient);
    recipientAddress = clientAddress(recipientClient);
  });

  afterAll(async () => {
    await Promise.all([payerClient.aclose(), recipientClient.aclose()]);
  });

  describe("V1", () => {
    it("gets a V1 guarantee for ETH", async () => {
      const amount = resolveGuaranteeAmount(ETH_DECIMALS);
      const requirements = {
        scheme: "4mica-credit",
        network,
        maxAmountRequired: amount.toString(),
        payTo: recipientAddress,
        asset: ETH_ASSET,
        maxTimeoutSeconds: resolveTabTtl(),
      } satisfies Parameters<FacilitatorX402Flow["signPayment"]>[0];

      const signed = await facilitatorFlow.signPayment(
        requirements,
        payerAddress,
      );
      expect(signed.payload.claims.version).toBe("v1");

      const envelope: X402PaymentEnvelopeV1 = {
        x402Version: 1,
        scheme: requirements.scheme,
        network: requirements.network,
        payload: signed.payload,
      };

      const cert = await issueGuaranteeViaFacilitator(
        facilitatorClient,
        envelope as Parameters<FourMicaFacilitatorClient["settle"]>[0],
        requirements as Parameters<FourMicaFacilitatorClient["settle"]>[1],
      );

      const decoded =
        await recipientClient.recipient.verifyPaymentGuarantee(cert);
      expect(decoded.version).toBe(1);
      expect(decoded.amount).toBeGreaterThan(0n);
      expect(decoded.userAddress.toLowerCase()).toBe(
        payerAddress.toLowerCase(),
      );
      expect(decoded.recipientAddress.toLowerCase()).toBe(
        recipientAddress.toLowerCase(),
      );
    });

    it("gets a V1 guarantee for each supported stablecoin", async () => {
      const tokens = await getSupportedStablecoins(payerClient);
      expect(
        tokens.length,
        "core returned no supported tokens",
      ).toBeGreaterThan(0);

      for (const token of tokens) {
        const amount = resolveGuaranteeAmount(token.decimals);
        const requirements = {
          scheme: "4mica-credit",
          network,
          maxAmountRequired: amount.toString(),
          payTo: recipientAddress,
          asset: token.address,
          maxTimeoutSeconds: resolveTabTtl(),
        } satisfies Parameters<FacilitatorX402Flow["signPayment"]>[0];

        const flow = new FacilitatorX402Flow(
          payerClient.user,
          facilitatorClient,
        );
        const signed = await flow.signPayment(requirements, payerAddress);
        expect(
          signed.payload.claims.version,
          `expected v1 for ${token.symbol}`,
        ).toBe("v1");

        const envelope: X402PaymentEnvelopeV1 = {
          x402Version: 1,
          scheme: requirements.scheme,
          network: requirements.network,
          payload: signed.payload,
        };

        const cert = await issueGuaranteeViaFacilitator(
          facilitatorClient,
          envelope as Parameters<FourMicaFacilitatorClient["settle"]>[0],
          requirements as Parameters<FourMicaFacilitatorClient["settle"]>[1],
        );

        const decoded =
          await recipientClient.recipient.verifyPaymentGuarantee(cert);
        expect(decoded.version, `guarantee version for ${token.symbol}`).toBe(
          1,
        );
        expect(decoded.amount, `amount for ${token.symbol}`).toBeGreaterThan(
          0n,
        );
      }
    });
  });

  describe("V2", () => {
    const resolveValidationRegistry = (client: Client): string => {
      const fromEnv = process.env["VALIDATION_REGISTRY"];
      if (fromEnv) return fromEnv;
      const fromParams = client.params.trustedValidationRegistries[0];
      if (!fromParams) {
        throw new Error(
          "VALIDATION_REGISTRY env var is required for V2 guarantees — core returned no trusted registries",
        );
      }
      return fromParams;
    };

    it("gets a V2 guarantee for each supported stablecoin", async () => {
      const tokens = await getSupportedStablecoins(payerClient);
      expect(
        tokens.length,
        "core returned no supported tokens",
      ).toBeGreaterThan(0);

      const validationRegistryAddress = resolveValidationRegistry(payerClient);
      const validatorAddress = process.env["VALIDATOR_ADDRESS"];
      if (!validatorAddress)
        throw new Error(
          "VALIDATOR_ADDRESS env var is required for V2 guarantees",
        );

      const validatorAgentId = BigInt(process.env["VALIDATOR_AGENT_ID"] ?? "1");
      const minValidationScore = envNumber("MIN_VALIDATION_SCORE", 80);
      const requiredValidationTag = process.env["VALIDATION_TAG"] ?? "";
      const targetChainId = payerClient.params.chainId;

      for (const token of tokens) {
        const amount = resolveV2GuaranteeAmount(token.decimals);
        const jobSpec = {
          task: "4mica-e2e-v2",
          input: { token: token.symbol, amount: amount.toString() },
        };
        const jobHash = keccak256(
          new TextEncoder().encode(JSON.stringify(jobSpec)),
        );

        const requirements = {
          scheme: "4mica-credit",
          network,
          amount: amount.toString(),
          payTo: recipientAddress,
          asset: token.address,
          maxTimeoutSeconds: resolveTabTtl(),
          extra: {
            validationRegistryAddress,
            validationChainId: targetChainId,
            validatorAddress,
            validatorAgentId: toHex(validatorAgentId),
            minValidationScore,
            jobHash,
            requiredValidationTag,
          },
        } satisfies Parameters<FacilitatorX402Flow["signPaymentV2"]>[1];

        const paymentRequired: X402PaymentRequired = {
          x402Version: 2,
          resource: {
            url: `${process.env["FACILITATOR_URL"] ?? "http://127.0.0.1:8080"}/resource/v2`,
            description: "4mica-e2e-v2",
            mimeType: "application/json",
          },
          accepts: [requirements],
        };

        const flow = new FacilitatorX402Flow(
          payerClient.user,
          facilitatorClient,
        );
        const signed = await flow.signPaymentV2(
          paymentRequired,
          requirements,
          payerAddress,
        );
        expect(
          signed.payload.claims.version,
          `expected v2 for ${token.symbol}`,
        ).toBe("v2");

        const envelope: X402PaymentEnvelopeV2 = {
          x402Version: 2,
          accepted: requirements,
          payload: signed.payload,
          resource: paymentRequired.resource,
        };

        const cert = await issueGuaranteeViaFacilitator(
          facilitatorClient,
          envelope as Parameters<FourMicaFacilitatorClient["settle"]>[0],
          requirements as Parameters<FourMicaFacilitatorClient["settle"]>[1],
        );

        const decoded =
          await recipientClient.recipient.verifyPaymentGuarantee(cert);
        expect(decoded.version, `guarantee version for ${token.symbol}`).toBe(
          2,
        );
        expect(
          decoded.validationPolicy,
          `validationPolicy missing for ${token.symbol}`,
        ).toBeTruthy();
        expect(decoded.amount, `amount for ${token.symbol}`).toBeGreaterThan(
          0n,
        );
        expect(
          decoded.validationPolicy!.validationRegistryAddress.toLowerCase(),
        ).toBe(validationRegistryAddress.toLowerCase());
        expect(decoded.validationPolicy!.validatorAddress.toLowerCase()).toBe(
          validatorAddress.toLowerCase(),
        );
        expect(decoded.validationPolicy!.minValidationScore).toBe(
          minValidationScore,
        );
      }
    });
  });
});
