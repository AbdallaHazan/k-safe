from datetime import timedelta

from django.conf import settings
from rest_framework import permissions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def issue_pre_2fa_token(user) -> str:
    """Short-lived token that only unlocks the verify-2fa step."""
    token = AccessToken.for_user(user)
    token["pre_2fa"] = True
    token.set_exp(from_time=None, lifetime=timedelta(minutes=5))
    return str(token)


def validate_pre_2fa_token(raw_token: str, expected_user) -> None:
    try:
        token = AccessToken(raw_token)
    except Exception as exc:
        raise AuthenticationFailed("Invalid or expired pre-auth token.") from exc
    if not token.get("pre_2fa"):
        raise AuthenticationFailed("Invalid pre-auth token.")
    if str(token.get("user_id")) != str(expected_user.id):
        raise AuthenticationFailed("Pre-auth token does not match user.")


def blacklist_user_tokens(user) -> None:
    """Revoke all outstanding refresh tokens for a user (e.g. after password change)."""
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


class RejectPre2FAJWTAuthentication(JWTAuthentication):
    """Normal API auth — reject tokens issued only for the 2FA challenge."""

    def get_validated_token(self, raw_token):
        validated = super().get_validated_token(raw_token)
        if validated.get("pre_2fa"):
            raise InvalidToken("Complete two-factor authentication first.")
        if validated.get("admin_pre_auth") or validated.get("admin_session"):
            raise InvalidToken("Admin tokens are not valid for vault APIs.")
        return validated


class AdminJWTAuthentication(JWTAuthentication):
    """Accept only fully verified admin-session JWTs."""

    def get_validated_token(self, raw_token):
        validated = super().get_validated_token(raw_token)
        if validated.get("admin_session") is not True:
            raise InvalidToken("A verified admin session is required.")
        return validated


class IsFullyAuthenticated(permissions.BasePermission):
    """Blocks pre-2FA tokens even if somehow accepted."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        token = getattr(request, "auth", None)
        if token is not None and token.get("pre_2fa"):
            return False
        return True


def issue_session_tokens(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def issue_admin_pre_auth_token(user) -> str:
    token = AccessToken.for_user(user)
    token["admin_pre_auth"] = True
    token.set_exp(from_time=None, lifetime=timedelta(minutes=5))
    return str(token)


def issue_admin_session_tokens(user) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh["admin_session"] = True
    access = refresh.access_token
    # Explicitly stamp the access token so admin APIs never accept a
    # refresh-derived token that somehow dropped the custom claim.
    access["admin_session"] = True
    return {
        "access": str(access),
        "refresh": str(refresh),
    }
