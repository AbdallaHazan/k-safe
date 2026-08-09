"""
Reference AES-256-GCM helpers.

In production KeySafe, credential encrypt/decrypt happens in the browser so the
server never sees plaintext. These helpers exist for:
- Unit tests
- Optional server-side tooling
- Documenting the exact wire format expected from the client

Wire format (base64):
    nonce (12 bytes) || ciphertext || tag (16 bytes)
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

NONCE_SIZE = 12
KEY_SIZE = 32
TAG_SIZE = 16


def generate_key() -> bytes:
    return AESGCM.generate_key(bit_length=KEY_SIZE * 8)


def encrypt(plaintext: str, key: bytes, associated_data: bytes | None = None) -> str:
    if len(key) != KEY_SIZE:
        raise ValueError("AES-256-GCM requires a 32-byte key")
    nonce = os.urandom(NONCE_SIZE)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), associated_data)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt(blob: str, key: bytes, associated_data: bytes | None = None) -> str:
    if len(key) != KEY_SIZE:
        raise ValueError("AES-256-GCM requires a 32-byte key")
    raw = base64.b64decode(blob)
    if len(raw) < NONCE_SIZE + TAG_SIZE:
        raise ValueError("Ciphertext blob is too short")
    nonce, ciphertext = raw[:NONCE_SIZE], raw[NONCE_SIZE:]
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext, associated_data)
    return plaintext.decode("utf-8")
