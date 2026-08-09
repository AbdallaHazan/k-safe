from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model

from vault.models import Credential

from .models import SecurityLog

User = get_user_model()


def log_security_event(
    *,
    user,
    action: str,
    ip_address: str | None = None,
    user_agent: str = "",
    metadata: dict[str, Any] | None = None,
) -> SecurityLog:
    return SecurityLog.objects.create(
        user=user,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent or "",
        metadata=metadata or {},
    )


def compute_security_score(user) -> dict[str, Any]:
    """
    Security score based on account hygiene + client-reported password strength.

    Reused/weak password detection for ciphertext vaults is done client-side after
    decrypt; the API aggregates client-reported strength scores stored on each
    credential plus account-level factors (2FA, recovery codes).
    """
    credentials = list(
        Credential.objects.filter(user=user, is_deleted=False).only(
            "password_strength", "password_changed_at", "updated_at"
        )
    )
    total = len(credentials)
    weak = sum(1 for c in credentials if c.password_strength < 60)
    medium = sum(1 for c in credentials if 60 <= c.password_strength < 80)
    strong = sum(1 for c in credentials if c.password_strength >= 80)

    score = 100
    deductions: list[dict[str, Any]] = []

    if not user.two_factor_enabled:
        score -= 25
        deductions.append(
            {
                "code": "missing_2fa",
                "message": "Two-factor authentication is not enabled.",
                "severity": 25,
            }
        )

    recovery_count = user.recovery_codes.filter(used_at__isnull=True).count()
    if user.two_factor_enabled and recovery_count == 0:
        score -= 10
        deductions.append(
            {
                "code": "missing_recovery_codes",
                "message": "No unused recovery codes remain.",
                "severity": 10,
            }
        )

    if total > 0:
        weak_ratio = weak / total
        if weak_ratio > 0:
            penalty = min(40, int(weak_ratio * 40))
            score -= penalty
            deductions.append(
                {
                    "code": "weak_passwords",
                    "message": f"{weak} weak password(s) detected.",
                    "penalty": penalty,
                }
            )

    score = max(0, min(100, score))

    return {
        "score": score,
        "total_credentials": total,
        "weak_passwords": weak,
        "medium_passwords": medium,
        "strong_passwords": strong,
        "two_factor_enabled": user.two_factor_enabled,
        "unused_recovery_codes": recovery_count,
        "deductions": deductions,
    }
