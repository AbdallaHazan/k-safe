"""
Second-factor gate for Django's built-in /admin/ site.

Paired with `accounts.middleware.AdminOTPGateMiddleware`, which redirects any
staff session that hasn't completed this verification away from every other
/admin/ page.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render

from .email_otp import issue_email_otp, verify_email_otp
from .middleware import ADMIN_OTP_SENT_SESSION_KEY, ADMIN_OTP_SESSION_KEY
from .models import EmailOTP


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}***@{domain}"


@login_required(login_url="/admin/login/")
def admin_otp_verify(request):
    user = request.user
    if not user.is_staff:
        return redirect("/")

    next_url = request.GET.get("next") or request.POST.get("next") or "/admin/"
    if request.session.get(ADMIN_OTP_SESSION_KEY):
        return redirect(next_url)

    error = None
    info = None

    if user.is_locked():
        error = "Account temporarily locked due to failed attempts. Try again later."
    elif request.method == "POST":
        if request.POST.get("resend"):
            try:
                issue_email_otp(user, EmailOTP.Purpose.ADMIN_LOGIN)
                request.session[ADMIN_OTP_SENT_SESSION_KEY] = True
                info = f"A new code was sent to {_mask_email(user.email)}."
            except Exception:
                error = "Could not send a new code. Try again shortly."
        else:
            raw = request.POST.get("code", "")
            code = "".join(ch for ch in raw if ch.isdigit())
            if code and verify_email_otp(user, EmailOTP.Purpose.ADMIN_LOGIN, code):
                request.session[ADMIN_OTP_SESSION_KEY] = True
                request.session.pop(ADMIN_OTP_SENT_SESSION_KEY, None)
                user.clear_failed_logins()
                return redirect(next_url)
            user.register_failed_login(
                settings.ACCOUNT_LOCKOUT_ATTEMPTS, settings.ACCOUNT_LOCKOUT_MINUTES
            )
            error = "Invalid or expired code."

    if not error and not request.session.get(ADMIN_OTP_SENT_SESSION_KEY):
        try:
            issue_email_otp(user, EmailOTP.Purpose.ADMIN_LOGIN)
            request.session[ADMIN_OTP_SENT_SESSION_KEY] = True
        except Exception:
            error = "Could not send the verification email. Use \"Resend code\" to retry."

    return render(
        request,
        "accounts/admin_otp_verify.html",
        {
            "error": error,
            "info": info,
            "email_hint": _mask_email(user.email),
            "next": next_url,
        },
    )
