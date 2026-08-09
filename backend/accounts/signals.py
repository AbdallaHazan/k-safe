from django.conf import settings
from django.contrib.auth.signals import user_logged_in
from django.db.models.signals import post_save
from django.dispatch import receiver

from vault.models import Category

from .email_otp import issue_email_otp
from .middleware import ADMIN_OTP_SENT_SESSION_KEY, ADMIN_OTP_SESSION_KEY
from .models import EmailOTP, User


@receiver(post_save, sender=User)
def seed_default_categories(sender, instance: User, created: bool, **kwargs):
    """Create default vault categories when a user registers."""
    if not created:
        return
    Category.objects.bulk_create(
        [
            Category(user=instance, name=name, is_default=True)
            for name in settings.DEFAULT_CATEGORIES
        ]
    )


@receiver(user_logged_in)
def require_otp_after_admin_session_login(sender, request, user, **kwargs):
    """
    `django.contrib.auth.login()` is only ever called by the built-in admin
    site in this project (the SPA uses stateless JWTs). Any time a staff user
    completes that session login, force a fresh email-OTP challenge before
    `AdminOTPGateMiddleware` will let the request through to other admin
    pages — otherwise the plain admin login form would bypass the OTP gate
    the SPA's admin flow enforces.
    """
    if not user.is_staff:
        return
    request.session[ADMIN_OTP_SESSION_KEY] = False
    request.session.pop(ADMIN_OTP_SENT_SESSION_KEY, None)
    try:
        issue_email_otp(user, EmailOTP.Purpose.ADMIN_LOGIN)
        request.session[ADMIN_OTP_SENT_SESSION_KEY] = True
    except Exception:
        # admin_otp_verify will retry sending on first render.
        pass
