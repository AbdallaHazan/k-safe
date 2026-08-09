"""
Server-side crypto helpers for non-vault secrets (e.g. TOTP seeds).

Vault credential encryption is client-side (zero-knowledge). The server must
never receive plaintext credential passwords. This module only protects
server-managed secrets at rest using a key derived from Django SECRET_KEY.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    # Derive a stable 32-byte key from SECRET_KEY, then urlsafe-base64 encode
    # for Fernet. Rotating SECRET_KEY invalidates stored TOTP secrets — document
    # this operationally and re-enroll 2FA after key rotation.
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Unable to decrypt secret") from exc
