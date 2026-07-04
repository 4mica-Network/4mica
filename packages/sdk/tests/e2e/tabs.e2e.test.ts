import type { FourMicaFacilitatorClient } from "@4mica/x402/server";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Client } from "../../src";
import {
  clientAddress,
  describeE2E,
  ETH_ASSET,
  getSupportedStablecoins,
  makeFacilitatorClient,
  makePayerClient,
  makeRecipientClient,
  resolveTabTtl,
} from "./setup";

describeE2E("Open Tabs", () => {
  let payerClient: Client;
  let recipientClient: Client;
  let facilitatorClient: FourMicaFacilitatorClient;
  let network: string;
  let payerAddress: `0x${string}`;
  let recipientAddress: `0x${string}`;

  beforeAll(async () => {
    [payerClient, recipientClient] = await Promise.all([
      makePayerClient(),
      makeRecipientClient(),
    ]);
    facilitatorClient = makeFacilitatorClient();
    network = `eip155:${payerClient.params.chainId}`;
    payerAddress = clientAddress(payerClient);
    recipientAddress = clientAddress(recipientClient);
  });

  afterAll(async () => {
    await Promise.all([payerClient.aclose(), recipientClient.aclose()]);
  });

  it("opens a tab for ETH via facilitator", async () => {
    const tab = await facilitatorClient.openTab(
      payerAddress,
      {
        payTo: recipientAddress,
        network,
        asset: ETH_ASSET,
      } as Parameters<FourMicaFacilitatorClient["openTab"]>[1],
      resolveTabTtl(),
    );

    expect(tab.tabId).toBeTruthy();
    expect(tab.assetAddress).toBeTruthy();
  });

  it("opens a tab for each supported stablecoin via facilitator", async () => {
    const tokens = await getSupportedStablecoins(payerClient);
    expect(tokens.length, "core returned no supported tokens").toBeGreaterThan(
      0,
    );

    for (const token of tokens) {
      const tab = await facilitatorClient.openTab(
        payerAddress,
        {
          payTo: recipientAddress,
          network,
          asset: token.address,
        } as Parameters<FourMicaFacilitatorClient["openTab"]>[1],
        resolveTabTtl(),
      );

      expect(tab.tabId, `tabId missing for ${token.symbol}`).toBeTruthy();
      expect(
        tab.assetAddress,
        `assetAddress missing for ${token.symbol}`,
      ).toBeTruthy();
    }
  });
});
