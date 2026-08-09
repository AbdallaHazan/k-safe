"""
WebAuthn (Windows Hello / Touch ID / Face ID) helpers.
"""

from __future__ import annotations

import json
from urllib.parse import urlparse

from django.conf import settings
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .models import WebAuthnCredential


def _rp_id() -> str:
    # Prefer FRONTEND_URL host for browser WebAuthn rpId
    frontend = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    host = urlparse(frontend).hostname or "localhost"
    return host


def _origin() -> str:
    return getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")


def registration_options_for(user) -> dict:
    exclude = [
        PublicKeyCredentialDescriptor(
            id=base64url_to_bytes(cred.credential_id),
        )
        for cred in user.webauthn_credentials.all()
    ]
    options = generate_registration_options(
        rp_id=_rp_id(),
        rp_name="KeySafe",
        user_id=user.id.bytes,
        user_name=user.email,
        user_display_name=user.name or user.email,
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    return json.loads(options_to_json(options))


def verify_and_store_registration(user, credential: dict, expected_challenge: str, device_name: str = ""):
    verification = verify_registration_response(
        credential=credential,
        expected_challenge=base64url_to_bytes(expected_challenge),
        expected_rp_id=_rp_id(),
        expected_origin=_origin(),
    )
    cred = WebAuthnCredential.objects.create(
        user=user,
        credential_id=bytes_to_base64url(verification.credential_id),
        public_key=bytes_to_base64url(verification.credential_public_key),
        sign_count=verification.sign_count,
        device_name=device_name or "This device",
        transports=credential.get("response", {}).get("transports") or [],
    )
    user.biometric_enabled = True
    user.save(update_fields=["biometric_enabled", "updated_at"])
    return cred


def authentication_options_for(user) -> dict:
    allow = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(cred.credential_id))
        for cred in user.webauthn_credentials.all()
    ]
    options = generate_authentication_options(
        rp_id=_rp_id(),
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return json.loads(options_to_json(options))


def verify_authentication(user, credential: dict, expected_challenge: str):
    cred_id = credential.get("id")
    stored = user.webauthn_credentials.filter(credential_id=cred_id).first()
    if not stored:
        raise ValueError("Unknown authenticator")
    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=base64url_to_bytes(expected_challenge),
        expected_rp_id=_rp_id(),
        expected_origin=_origin(),
        credential_public_key=base64url_to_bytes(stored.public_key),
        credential_current_sign_count=stored.sign_count,
    )
    stored.sign_count = verification.new_sign_count
    from django.utils import timezone

    stored.last_used_at = timezone.now()
    stored.save(update_fields=["sign_count", "last_used_at"])
    return stored
