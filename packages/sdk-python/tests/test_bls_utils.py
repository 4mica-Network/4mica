import builtins

import pytest

from fourmica_sdk.bls_utils import signature_to_words
from fourmica_sdk.errors import VerificationError


def test_signature_to_words_prompts_for_optional_dependency(monkeypatch):
    original_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name.startswith("py_ecc"):
            raise ImportError("force-missing")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(VerificationError, match="py-ecc is required"):
        signature_to_words("0x" + "00" * 96)


def test_signature_to_words_supports_current_py_ecc_api():
    words = signature_to_words(
        "99e2f6943758692c9e2f8a2258d5b4542ffdee5867d8415b3786e950ef45e933"
        "a324d54244f5bc91b02add4cb3d19a7217885aaec9089db16ab8c440d6859c61"
        "3f3ea765d0d9a2426ef9d8ddff72dd24e64a98851a60fc2e9fd0e28312c74c36"
    )

    assert len(words) == 8
    assert all(isinstance(word, bytes) for word in words)
    assert all(len(word) == 32 for word in words)


def test_signature_to_words_rejects_invalid_hex():
    pytest.importorskip("py_ecc")
    with pytest.raises(VerificationError, match="invalid BLS signature"):
        signature_to_words(
            "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG"
        )
