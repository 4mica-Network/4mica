/**
 * Authorization digest parity. The type strings are pinned exactly as in
 * `sdk-rust/src/digest.rs`, and the two domain-separator reconstructions are
 * pinned against values read from the deployed contracts (Base Sepolia USDC
 * and the canonical Permit2) — the same expectations the Rust and Python
 * suites carry.
 */

import { recoverAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  CANCEL_WITHDRAWAL_TYPE,
  coreDomainSeparator,
  digestForCancelWithdrawal,
  digestForPermit2Transfer,
  digestForReceiveAuthorization,
  digestForRequestWithdrawal,
  EIP2612_PERMIT_TYPE,
  ERC3009_TYPE,
  eip712DomainSeparator,
  PERMIT2_TRANSFER_TYPE,
  permit2DomainSeparator,
  REQUEST_WITHDRAWAL_TYPE,
} from "@/digest";
import { account, TEST_ADDRESS } from "./helpers/ctx";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DOMAIN = `0x${"00112233445566778899aabbccddeeff".repeat(2)}`;
const NONCE = `0x${"de".repeat(32)}`;

describe("authorization type strings", () => {
  it("are pinned", () => {
    expect(ERC3009_TYPE).toBe(
      "ReceiveWithAuthorization(address from,address to,uint256 value," +
        "uint256 validAfter,uint256 validBefore,bytes32 nonce)",
    );
    expect(PERMIT2_TRANSFER_TYPE).toBe(
      "PermitTransferFrom(TokenPermissions permitted,address spender," +
        "uint256 nonce,uint256 deadline)" +
        "TokenPermissions(address token,uint256 amount)",
    );
    expect(EIP2612_PERMIT_TYPE).toBe(
      "Permit(address owner,address spender,uint256 value,uint256 nonce," +
        "uint256 deadline)",
    );
    expect(REQUEST_WITHDRAWAL_TYPE).toBe(
      "RequestWithdrawal(address user,address asset,uint256 amount," +
        "uint256 validAfter,uint256 validBefore,bytes32 nonce)",
    );
    expect(CANCEL_WITHDRAWAL_TYPE).toBe(
      "CancelWithdrawal(address user,address asset,uint256 validAfter," +
        "uint256 validBefore,bytes32 nonce)",
    );
  });
});

describe("domain separators", () => {
  it("reconstructs Base Sepolia USDC's own DOMAIN_SEPARATOR()", () => {
    // The whole risk of reconstruction is metadata disagreeing with the
    // token, so the expectation comes from the token, not from re-running
    // the formula.
    expect(eip712DomainSeparator("USDC", "2", 84532, USDC)).toBe(
      "0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818",
    );
  });

  it("is sensitive to the name", () => {
    // Base *mainnet* USDC calls itself "USD Coin"; using the wrong one is a
    // silent failure — a well-formed separator nothing verifies against.
    expect(eip712DomainSeparator("USDC", "2", 84532, USDC)).not.toBe(
      eip712DomainSeparator("USD Coin", "2", 84532, USDC),
    );
  });

  it("derives Permit2's domain to match the deployed contract", () => {
    expect(permit2DomainSeparator(84532)).toBe(
      "0x010f27a92fb9a32622f44f001dc4d15706a85b33499cfc2ce9033113ab26592c",
    );
    expect(permit2DomainSeparator(84532)).not.toBe(permit2DomainSeparator(1));
  });

  it("makes the Core4Mica domain deployment-specific", () => {
    const contract = "0x00000000000000000000000000000000C04E4a1c";
    expect(coreDomainSeparator(84532, contract)).toBe(
      eip712DomainSeparator("Core4Mica", "1", 84532, contract),
    );
    expect(coreDomainSeparator(84532, contract)).not.toBe(
      coreDomainSeparator(1, contract),
    );
    // Core signs requests under its own operator domain; reusing that name
    // would produce a well-formed separator Core4Mica rejects.
    expect(coreDomainSeparator(84532, contract)).not.toBe(
      eip712DomainSeparator("4mica", "1", 84532, contract),
    );
  });
});

describe("authorization digests", () => {
  it("receive-authorization signatures recover to the signer", async () => {
    const digest = digestForReceiveAuthorization(
      DOMAIN,
      account.address,
      "0x00000000000000000000000000000000000000Be",
      1_000_000n,
      0,
      2_000_000_000,
      NONCE,
    );
    const signature = await account.sign({ hash: digest });
    await expect(recoverAddress({ hash: digest, signature })).resolves.toBe(
      TEST_ADDRESS,
    );
  });

  it("permit2-transfer signatures recover to the signer", async () => {
    const digest = digestForPermit2Transfer(
      DOMAIN,
      USDC,
      1_000_000n,
      "0x00000000000000000000000000000000000000Be",
      42n,
      2_000_000_000,
    );
    const signature = await account.sign({ hash: digest });
    await expect(recoverAddress({ hash: digest, signature })).resolves.toBe(
      TEST_ADDRESS,
    );
  });

  it("request and cancel digests differ for the same inputs", () => {
    // The two withdrawal actions share a nonce namespace on-chain, so their
    // digests must differ even when every shared field agrees — otherwise
    // one signature would authorize both.
    const request = digestForRequestWithdrawal(
      DOMAIN,
      account.address,
      USDC,
      0n,
      0,
      2_000_000_000,
      NONCE,
    );
    const cancel = digestForCancelWithdrawal(
      DOMAIN,
      account.address,
      USDC,
      0,
      2_000_000_000,
      NONCE,
    );
    expect(request).not.toBe(cancel);
  });
});
