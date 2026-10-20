use alloy::sol;

sol! {
    #[sol(rpc)]
    /// The Treasury contract, which holds collateral. It still signs under the EIP-712 name
    /// "Core4Mica".
    contract Core4Mica {
        error AmountZero();
        error InsufficientAvailable();
        error TransferFailed();
        error GracePeriodNotElapsed();
        error NoWithdrawalRequested();
        error DirectTransferNotAllowed();
        error InvalidSignature();
        error InvalidRecipient();
        error UnsupportedAsset(address asset);
        error InvalidAsset(address asset);
        error FeeTooHigh();
        error TreasuryClaimExceedsAvailable();
        /// The pool cannot pay `requested` out right now: its idle assets plus what the strategy
        /// can release fall short.
        error InsufficientLiquidity(address asset, uint256 requested, uint256 available);
        /// The pool has shares outstanding but nothing backing them.
        error PoolInsolvent(address asset);
        error UserShareUnderflow(address asset, address user, uint256 deduction, uint256 balance);
        error DepositsDisabled();
        error StablecoinDepositsDisabled(address asset);
        error EnforcedPause();
        error ZeroAddress();
        error ReconciliationLoss(address asset, uint256 tracked, uint256 observed);
        /// The deposited asset delivered less than `expected` (fee-on-transfer tokens), or a
        /// native-value deposit did not match `msg.value`.
        error ValueMismatch(uint256 expected, uint256 actual);
        /// `amount` was too small to mint any pool shares.
        error ZeroCollateralCredit(address asset, uint256 amount);
        error AuthorizationExpired(uint256 validBefore);
        error AuthorizationNotYetValid(uint256 validAfter);
        error AuthorizationAlreadyUsed(address user, bytes32 nonce);

        function withdrawalGracePeriod() external view returns (uint256);
        function yieldFeeBps() external view returns (uint256);

        event CollateralDeposited(address indexed user, address indexed asset, uint256 amount);
        event CollateralWithdrawn(address indexed user, address indexed asset, uint256 amount);
        event WithdrawalRequested(address indexed user, address indexed asset, uint256 when, uint256 amount);
        event WithdrawalCanceled(address indexed user, address indexed asset);
        event AuthorizationUsed(address indexed user, bytes32 indexed nonce);
        event WithdrawalGracePeriodUpdated(uint256 newGracePeriod);
        event StablecoinAssetUpdated(address indexed asset, bool enabled);
        event YieldFeeBpsUpdated(uint256 oldFeeBps, uint256 newFeeBps);
        event ProtocolYieldClaimed(address indexed asset, address indexed to, uint256 amount);

        struct WithdrawalRequest {
            uint256 timestamp;
            uint256 amount;
        }

        struct UserAssetInfo {
            address asset;
            uint256 collateral;
            uint256 withdrawalRequestTimestamp;
            uint256 withdrawalRequestAmount;
        }

        /// A client's EIP-3009 authorization to move the deposit amount from `from` into the
        /// Core4Mica contract. Any caller may submit it; collateral is credited to `from`, the
        /// signer, never `msg.sender`.
        ///
        /// Serde-encoded with alloy's `0x`-hex representation so a facilitator can accept one
        /// straight off an HTTP request body.
        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct ReceiveAuthorization {
            address from;
            uint256 validAfter;
            uint256 validBefore;
            bytes32 nonce;
            uint8 v;
            bytes32 r;
            bytes32 s;
        }

        /// A client's Permit2 `PermitTransferFrom` authorization to move the deposit amount from
        /// `from` into the Core4Mica contract via the canonical Permit2 contract. Any caller may
        /// submit it; collateral is credited to `from`, the signer, never `msg.sender`. Requires a
        /// one-time ERC-20 approval from `from` to Permit2 for the deposited asset.
        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct Permit2Authorization {
            address from;
            uint256 nonce;
            uint256 deadline;
            bytes signature;
        }

        /// A user's EIP-712 authorization to open a withdrawal request on their behalf. Any caller
        /// may submit it; the request is recorded against `user`, the signer, never `msg.sender`.
        /// `asset` is `address(0)` for ETH.
        ///
        /// `signature` covers every other field, so a submitter can alter none of them.
        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct WithdrawalRequestAuthorization {
            address user;
            address asset;
            uint256 amount;
            uint256 validAfter;
            uint256 validBefore;
            bytes32 nonce;
            bytes signature;
        }

        /// A user's EIP-712 authorization to cancel their pending withdrawal request for `asset`.
        /// Shares its nonce namespace with [`WithdrawalRequestAuthorization`].
        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct WithdrawalCancelAuthorization {
            address user;
            address asset;
            uint256 validAfter;
            uint256 validBefore;
            bytes32 nonce;
            bytes signature;
        }

        /// @param manager Address of AccessManager
        /// @param minGracePeriod_ Floor the withdrawal grace period can never be lowered past
        constructor(address manager, address[] memory stablecoins_, uint256 minGracePeriod_);

        function deposit() external payable;
        function depositStablecoin(address asset, uint256 amount) external;
        /// Gasless deposit: a third party (e.g. a facilitator sponsoring gas) submits an
        /// EIP-3009 `receiveWithAuthorization` signature; collateral is credited to `auth.from`.
        function depositStablecoinWithAuthorization(address asset, uint256 amount, ReceiveAuthorization calldata auth) external;
        /// Gasless deposit via Permit2: a third party submits a `PermitTransferFrom` signature;
        /// collateral is credited to `p.from`. Works for any ERC-20 with a prior Permit2 approval.
        function depositStablecoinWithPermit2(address asset, uint256 amount, Permit2Authorization calldata p) external;
        function requestWithdrawal(uint256 amount) external;
        function requestWithdrawal(address asset, uint256 amount) external;
        function cancelWithdrawal() external;
        function cancelWithdrawal(address asset) external;
        function finalizeWithdrawal() external;
        function finalizeWithdrawal(address asset) external;

        /// Gasless withdrawal request: a third party submits the user's EIP-712 signature and the
        /// request is recorded against `auth.user`.
        function requestWithdrawalWithAuthorization(WithdrawalRequestAuthorization calldata auth) external;
        /// Gasless cancellation of `auth.user`'s pending request.
        function cancelWithdrawalWithAuthorization(WithdrawalCancelAuthorization calldata auth) external;
        /// Permissionless finalization. Pays `user`, so no signature is needed — and requiring one
        /// would mean the user must be around a grace period after requesting.
        function finalizeWithdrawalFor(address user, address asset) external;

        /// Core4Mica's own EIP-712 domain separator, for building withdrawal-authorization digests.
        function DOMAIN_SEPARATOR() external view returns (bytes32);
        /// True once `nonce` has been spent by one of `user`'s authorizations.
        function authorizationState(address user, bytes32 nonce) external view returns (bool);
        function REQUEST_WITHDRAWAL_TYPEHASH() external view returns (bytes32);
        function CANCEL_WITHDRAWAL_TYPEHASH() external view returns (bytes32);

        function setWithdrawalGracePeriod(uint256 _gracePeriod) external;
        function addStablecoinAsset(address asset, address strategy_) external;
        function setYieldFeeBps(uint256 feeBps) external;
        function claimProtocolYield(address asset, address to, uint256 amount) external;
        function getUserAllAssets(address userAddr)
            external
            view
            returns (UserAssetInfo[] memory);

        function getERC20Tokens() external view returns (address[] memory);

        function collateral(address userAddr) external view returns (uint256);
        function collateral(address userAddr, address asset) external view returns (uint256);
        function principalBalance(address user, address asset) external view returns (uint256);
        function guaranteeCapacity(address user, address asset) external view returns (uint256);
        function grossYield(address user, address asset) external view returns (uint256);
        function protocolYieldShare(address user, address asset) external view returns (uint256);
        function userNetYield(address user, address asset) external view returns (uint256);
        function withdrawableBalance(address user, address asset) external view returns (uint256);
        /// The ERC-4626 strategy backing `asset`'s pool, or zero while its assets sit idle.
        function strategy(address asset) external view returns (address);
        /// Underlying value backing `asset`'s pool: idle holdings plus the strategy position.
        function poolAssets(address asset) external view returns (uint256);
        /// Pool shares outstanding across users, the protocol and escrow.
        function poolShares(address asset) external view returns (uint256);
        function userShares(address user, address asset) external view returns (uint256);
        function totalUserShares(address asset) external view returns (uint256);
        function protocolShares(address asset) external view returns (uint256);

        function getUser(address userAddr) external view returns (
            uint256 assetCollateral,
            uint256 withdrawalRequestTimestamp,
            uint256 withdrawalRequestAmount
        );
        function getUser(address userAddr, address asset) external view returns (
            uint256 assetCollateral,
            uint256 withdrawalRequestTimestamp,
            uint256 withdrawalRequestAmount
        );
    }
}

sol! {
    #[sol(rpc)]
    contract GuaranteeRegistry {
        error ZeroAddress();
        error UnsupportedGuaranteeType(bytes32 typeHash);
        error MalformedGuarantee();

        event GuaranteeVerifierUpdated(bytes32 indexed typeHash, address verifier, address signer, bool enabled);
        event GuaranteeSignerUpdated(bytes32 indexed typeHash, address signer);
        event GuaranteeTypeEnabledUpdated(bytes32 indexed typeHash, bool enabled);

        /// How a guarantee layout is verified: which adapter hashes it, whose signature attests
        /// it, and whether it is currently accepted.
        struct GuaranteeConfig {
            address signer;
            address verifier;
            bool enabled;
        }

        function configureGuaranteeVerifier(address verifier, address signer, bool enabled) external;
        function setGuaranteeSigner(bytes32 typeHash, address signer) external;
        function setGuaranteeTypeEnabled(bytes32 typeHash, bool enabled) external;
        function getGuaranteeConfig(bytes32 typeHash) external view returns (GuaranteeConfig memory config);
        /// True when `signature` is the configured signer's over `guarantee`, whose first word
        /// names the layout. Takes a [`rpc::GuaranteeReceipt`]'s two fields as they are.
        function verifyGuarantee(bytes calldata guarantee, bytes calldata signature) external view returns (bool);
    }
}

sol! {
    #[sol(rpc)]
    contract ERC20 {
        event Transfer(address indexed from, address indexed to, uint256 amount);
        event Approval(address indexed owner, address indexed spender, uint256 amount);

        constructor(string memory name_, string memory symbol_);

        function mint(address to, uint256 amount) external;
        function approve(address spender, uint256 amount) external returns (bool);
        function allowance(address owner, address spender) external view returns (uint256);
        function transfer(address to, uint256 amount) external returns (bool);
        function transferFrom(address from, address to, uint256 amount) external returns (bool);
        /// EIP-712 domain separator, exposed by EIP-2612/EIP-3009 tokens (e.g. USDC). Used to build
        /// the gasless-deposit signing hash without reconstructing name/version/chainId.
        function DOMAIN_SEPARATOR() external view returns (bytes32);
    }
}

/// Canonical Permit2 contract, deployed at the same address on every supported chain.
pub const PERMIT2_ADDRESS: alloy::primitives::Address =
    alloy::primitives::address!("000000000022D473030F116dDEE9F6B43aC78BA3");

sol! {
    #[sol(rpc)]
    contract Permit2 {
        /// Permit2's own EIP-712 domain separator, used to build the Permit2 gasless-deposit hash.
        function DOMAIN_SEPARATOR() external view returns (bytes32);
    }
}

sol! {
    #[sol(rpc)]
    contract ClearingHouse {
        /// Same shape as [`Core4Mica::ReceiveAuthorization`]; redeclared because `sol!` blocks
        /// cannot share types.
        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct ReceiveAuthorization {
            address from;
            uint256 validAfter;
            uint256 validBefore;
            bytes32 nonce;
            uint8 v;
            bytes32 r;
            bytes32 s;
        }

        /// Same shape as [`Core4Mica::Permit2Authorization`]; redeclared because `sol!` blocks
        /// cannot share types.
        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct Permit2Authorization {
            address from;
            uint256 nonce;
            uint256 deadline;
            bytes signature;
        }

        function payNetDebit(bytes32 cycleId, uint256 netDebit, bytes32[] calldata proof) external payable;
        /// Sponsored debit payment: a third party submits the debtor's EIP-3009 signature and the
        /// exact net debit is pulled from `auth.from`'s wallet. `auth.nonce` must equal `cycleId`.
        function payNetDebitWithAuthorization(bytes32 cycleId, uint256 netDebit, bytes32[] calldata proof, ReceiveAuthorization calldata auth) external;
        /// Sponsored debit payment via Permit2: a third party submits the debtor's
        /// `PermitTransferFrom` signature and the exact net debit is pulled from `p.from`'s
        /// wallet. `p.nonce` must equal `uint256(cycleId)`.
        function payNetDebitWithPermit2(bytes32 cycleId, uint256 netDebit, bytes32[] calldata proof, Permit2Authorization calldata p) external;
        function claimNetCreditFor(address creditor, bytes32 cycleId, uint256 netCredit, bytes32[] calldata proof) external;
    }
}
