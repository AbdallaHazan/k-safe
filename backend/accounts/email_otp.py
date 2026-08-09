import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailOTP


OTP_TTL_MINUTES = 10


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def issue_email_otp(user, purpose: str) -> str:
    """Create a one-time code, store hash, email plaintext once. Returns plaintext."""
    EmailOTP.objects.filter(
        user=user, purpose=purpose, used_at__isnull=True
    ).delete()
    code = generate_otp_code()
    EmailOTP.objects.create(
        user=user,
        purpose=purpose,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=OTP_TTL_MINUTES),
    )
    _send_otp_email(user.email, code, purpose)
    return code


def verify_email_otp(user, purpose: str, code: str) -> bool:
    digits = "".join(ch for ch in str(code) if ch.isdigit())
    if len(digits) != 6:
        return False
    now = timezone.now()
    qs = EmailOTP.objects.filter(
        user=user, purpose=purpose, used_at__isnull=True, expires_at__gte=now
    ).order_by("-created_at")
    for row in qs[:5]:
        if check_password(digits, row.code_hash):
            row.used_at = now
            row.save(update_fields=["used_at"])
            return True
    return False


def _purpose_label(purpose: str) -> str:
    return {
        EmailOTP.Purpose.ENABLE_2FA: "enable two-factor authentication",
        EmailOTP.Purpose.DISABLE_2FA: "disable two-factor authentication",
        EmailOTP.Purpose.LOGIN_2FA: "sign in to KeySafe",
        EmailOTP.Purpose.ADMIN_LOGIN: "sign in to the KeySafe system admin",
        EmailOTP.Purpose.RESET_PASSWORD: "reset your KeySafe master password",
    }.get(purpose, "verify your KeySafe account")


def _send_otp_email(to_email: str, code: str, purpose: str) -> None:
    subject = "KeySafe verification code"
    body = (
        f"Your KeySafe code is: {code}\n\n"
        f"Use this code to {_purpose_label(purpose)}.\n"
        f"It expires in {OTP_TTL_MINUTES} minutes.\n\n"
        "If you did not request this, ignore this email."
    )
    send_mail(
        subject,
        body,
        getattr(settings, "DEFAULT_FROM_EMAIL", "KeySafe <noreply@keysafe.local>"),
        [to_email],
        fail_silently=False,
    )
