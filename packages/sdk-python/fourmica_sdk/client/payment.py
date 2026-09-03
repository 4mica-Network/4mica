"""Payment guarantees: the payer signs a request, the recipient turns it into
a certificate and checks it. Both roles live here since they exchange the same
claims."""

from __future__ import annotations

from typing import List

from ..bls_utils import verify_bls_signature
from ..errors import (
    CertificateMismatchError,
    GuaranteeDomainMismatchError,
    InvalidCertificateError,
    InvalidParamsError,
    UnsupportedGuaranteeVersionError,
    VerificationError,
)
from ..guarantee import decode_guarantee_claims
from ..models import (
    BLSCert,
    PaymentGuaranteeClaims,
    PaymentGuaranteeRequestClaims,
    PaymentSignature,
    RecipientPaymentInfo,
    SigningScheme,
)
from .ctx import ClientCtx


class PaymentClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    @property
    def guarantee_domain(self) -> bytes:
        """The domain separator guarantees are issued under at the current version."""
        return self._ctx.guarantee_domain

    @property
    def guarantee_domains(self) -> dict:
        """Domain separator per supported guarantee version."""
        return dict(self._ctx.guarantee_domains)

    async def sign_request(
        self,
        claims: PaymentGuaranteeRequestClaims,
        scheme: SigningScheme = SigningScheme.EIP712,
    ) -> PaymentSignature:
        """Signs a guarantee request as the payer. Hand the signature to the
        recipient, who redeems it with :meth:`issue_guarantee`."""
        return await self._ctx.payment_signer.sign_request(
            self._ctx.public_params, claims, scheme
        )

    async def issue_guarantee(
        self,
        claims: PaymentGuaranteeRequestClaims,
        signature: PaymentSignature,
        scheme: SigningScheme = SigningScheme.EIP712,
    ) -> BLSCert:
        """Redeems a payer's signed request for a certificate guaranteeing the
        payment, as the recipient. The signer must be the claims' recipient —
        the certificate credits them."""
        if claims.recipient_address.lower() != self._ctx.signer_address.lower():
            raise InvalidParamsError(
                f"claims recipient {claims.recipient_address} is not this signer "
                f"{self._ctx.signer_address}"
            )
        signature_hex = (
            signature.signature
            if isinstance(signature, PaymentSignature)
            else str(signature)
        )
        body = {
            "claims": claims.to_payload(),
            "signature": signature_hex,
            "scheme": SigningScheme(scheme).value,
        }
        return await self._ctx.rpc.issue_guarantee(body)

    def verify_guarantee(self, cert: BLSCert) -> PaymentGuaranteeClaims:
        """Checks that *cert* was issued by the operator this client trusts,
        returning the claims it certifies."""
        try:
            claims_bytes = cert.claims_bytes()
        except ValueError as exc:
            raise InvalidCertificateError(str(exc)) from exc

        if not verify_bls_signature(
            self._ctx.operator_public_key, claims_bytes, cert.signature
        ):
            raise CertificateMismatchError("certificate signature mismatch")

        try:
            claims = decode_guarantee_claims(claims_bytes)
        except VerificationError as exc:
            raise InvalidCertificateError(str(exc)) from exc

        expected_domain = self._ctx.guarantee_domain_for_version(claims.version)
        if expected_domain is None:
            raise UnsupportedGuaranteeVersionError(claims.version)
        if bytes(claims.domain) != expected_domain:
            raise GuaranteeDomainMismatchError("guarantee domain mismatch")
        return claims

    async def list_received(self) -> List[RecipientPaymentInfo]:
        """Payments guaranteed to the signer as a recipient."""
        return await self._ctx.rpc.list_recipient_payments(self._ctx.signer_address)
