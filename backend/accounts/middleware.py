from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone

ADMIN_OTP_SESSION_KEY = "admin_otp_verified"
ADMIN_OTP_SENT_SESSION_KEY = "admin_otp_sent"

# Paths under /admin/ that must stay reachable without a verified OTP,
# otherwise nobody could ever reach the verification step.
_ADMIN_OTP_EXEMPT_PREFIXES = (
    "/admin/login/",
    "/admin/logout/",
    "/admin/verify-otp/",
    "/admin/jsi18n/",
)


class AdminOTPGateMiddleware:
    """
    Django's built-in admin site (`/admin/`) authenticates with a plain
    session login (email + password) and would otherwise let any staff user
    bypass the mandatory email-OTP second factor enforced by the SPA's
    `/api/admin/login` + `/api/admin/login/verify` flow.

    This middleware blocks every admin page other than the login/logout and
    OTP-verification views until the staff user has verified a one-time code
    for the current Django session.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if path.startswith("/admin/") and not path.startswith(_ADMIN_OTP_EXEMPT_PREFIXES):
            user = getattr(request, "user", None)
            if (
                user is not None
                and getattr(user, "is_authenticated", False)
                and user.is_staff
                and not request.session.get(ADMIN_OTP_SESSION_KEY)
            ):
                return redirect(f"/admin/verify-otp/?next={quote(path)}")
        return self.get_response(request)


class IdleSessionTimeoutMiddleware:
    """
    Enforce idle timeout for session-authenticated requests.

    JWT access tokens already expire via SIMPLE_JWT ACCESS_TOKEN_LIFETIME.
    This middleware covers Django session auth (admin) and records last activity
    on the request session for future cookie-based SPA sessions.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.timeout = timedelta(minutes=settings.SESSION_IDLE_TIMEOUT_MINUTES)

    def __call__(self, request):
        if request.user.is_authenticated and hasattr(request, "session"):
            last = request.session.get("last_activity")
            now = timezone.now().isoformat()
            if last:
                last_dt = timezone.datetime.fromisoformat(last)
                if timezone.is_naive(last_dt):
                    last_dt = timezone.make_aware(last_dt, timezone.utc)
                if timezone.now() - last_dt > self.timeout:
                    request.session.flush()
                    if request.path.startswith("/api/"):
                        return JsonResponse(
                            {"detail": "Session expired due to inactivity."},
                            status=401,
                        )
            request.session["last_activity"] = now

        return self.get_response(request)
