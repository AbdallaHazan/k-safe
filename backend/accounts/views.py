from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from security_center.models import SecurityLog
from security_center.services import log_security_event
from vault.models import Credential

from .email_otp import issue_email_otp, verify_email_otp
from .models import EmailOTP, LoginHistory, TwoFactorAuthentication, User
from .security import (
    blacklist_user_tokens,
    issue_pre_2fa_token,
    issue_session_tokens,
    validate_pre_2fa_token,
)
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordResetSerializer,
    LoginSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
    Verify2FASerializer,
)
from .throttles import LoginRateThrottle, RegisterRateThrottle, SensitiveActionThrottle


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}***@{domain}"


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_security_event(
            user=user,
            action=SecurityLog.Action.REGISTER,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        LoginHistory.objects.create(
            user=user,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            success=True,
            failure_reason="registration",
        )
        # Issue a one-time onboarding session so the client can finish biometric
        # setup. Pending accounts cannot use /api/login until biometric is on.
        return Response(
            {
                "user": {
                    **UserSerializer(user).data,
                    "encrypted_vault_key": user.encrypted_vault_key,
                    "vault_key_nonce": user.vault_key_nonce,
                },
                "tokens": issue_session_tokens(user),
                "vault_idle_lock_minutes": settings.VAULT_IDLE_LOCK_MINUTES,
                "requires_biometric_setup": True,
                "message": (
                    "Account created. Complete biometric setup to activate your vault."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    Step 1 of login: verify master password.

    If 2FA is enabled, returns a short-lived pre-auth token only.
    Vault key material is NOT returned until /api/verify-2fa succeeds.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            email = (request.data.get("email") or "").lower().strip()
            user = User.objects.filter(email__iexact=email).first()
            if user and not user.is_locked():
                errors = serializer.errors
                detail = str(errors)
                if "locked" not in detail.lower():
                    user.register_failed_login(
                        settings.ACCOUNT_LOCKOUT_ATTEMPTS,
                        settings.ACCOUNT_LOCKOUT_MINUTES,
                    )
                    LoginHistory.objects.create(
                        user=user,
                        ip_address=_client_ip(request),
                        user_agent=request.META.get("HTTP_USER_AGENT", ""),
                        success=False,
                        failure_reason="invalid_credentials",
                    )
                    log_security_event(
                        user=user,
                        action=SecurityLog.Action.LOGIN_FAILED,
                        ip_address=_client_ip(request),
                        user_agent=request.META.get("HTTP_USER_AGENT", ""),
                    )
            raise ValidationError(serializer.errors)

        user: User = serializer.validated_data["user"]

        if user.is_staff:
            return Response(
                {
                    "detail": (
                        "System administrator accounts cannot use the user vault. "
                        "Sign in at /admin/login."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Pending = no biometric onboarding yet — not a usable vault account.
        if not user.biometric_enabled:
            LoginHistory.objects.create(
                user=user,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                success=False,
                failure_reason="pending_no_biometric",
            )
            return Response(
                {
                    "detail": (
                        "Your account is pending and does not have vault access yet. "
                        "Please contact a system administrator."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if user.two_factor_enabled:
            try:
                issue_email_otp(user, EmailOTP.Purpose.LOGIN_2FA)
            except Exception:
                return Response(
                    {
                        "detail": (
                            "Could not send the verification email. "
                            "Check email settings or try again shortly."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return Response(
                {
                    "requires_2fa": True,
                    "pre_auth_token": issue_pre_2fa_token(user),
                    "email_hint": _mask_email(user.email),
                    "user": {
                        "id": str(user.id),
                        "email": user.email,
                        "name": user.name,
                    },
                    "vault_idle_lock_minutes": settings.VAULT_IDLE_LOCK_MINUTES,
                }
            )

        user.clear_failed_logins()
        LoginHistory.objects.create(
            user=user,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            success=True,
        )
        log_security_event(
            user=user,
            action=SecurityLog.Action.LOGIN_SUCCESS,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response(
            {
                "requires_2fa": False,
                "tokens": issue_session_tokens(user),
                "user": {
                    **UserSerializer(user).data,
                    "encrypted_vault_key": user.encrypted_vault_key,
                    "vault_key_nonce": user.vault_key_nonce,
                },
                "vault_idle_lock_minutes": settings.VAULT_IDLE_LOCK_MINUTES,
            }
        )


class Verify2FAView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = Verify2FASerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()
        pre_auth_token = request.data.get("pre_auth_token") or ""

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid verification request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not pre_auth_token:
            return Response(
                {"detail": "pre_auth_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_pre_2fa_token(pre_auth_token, user)
        except Exception as exc:
            return Response(
                {"detail": str(getattr(exc, "detail", "Invalid pre-auth token."))},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if user.is_locked():
            return Response(
                {"detail": "Account temporarily locked."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user.biometric_enabled:
            return Response(
                {
                    "detail": (
                        "Your account is pending and does not have vault access yet. "
                        "Please contact a system administrator."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        email_code = serializer.validated_data["email_code"]
        verified = verify_email_otp(user, EmailOTP.Purpose.LOGIN_2FA, email_code)

        if not verified:
            user.register_failed_login(
                settings.ACCOUNT_LOCKOUT_ATTEMPTS,
                settings.ACCOUNT_LOCKOUT_MINUTES,
            )
            LoginHistory.objects.create(
                user=user,
                ip_address=_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                success=False,
                failure_reason="2fa_failed",
            )
            return Response(
                {"detail": "Invalid authentication code."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user.clear_failed_logins()
        LoginHistory.objects.create(
            user=user,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            success=True,
        )
        log_security_event(
            user=user,
            action=SecurityLog.Action.LOGIN_SUCCESS,
            ip_address=_client_ip(request),
            metadata={"method": "2fa"},
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response(
            {
                "tokens": issue_session_tokens(user),
                "user": {
                    **UserSerializer(user).data,
                    "encrypted_vault_key": user.encrypted_vault_key,
                    "vault_key_nonce": user.vault_key_nonce,
                },
                "vault_idle_lock_minutes": settings.VAULT_IDLE_LOCK_MINUTES,
            }
        )


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                token = RefreshToken(refresh)
                token.blacklist()
            except Exception:
                pass
        log_security_event(
            user=request.user,
            action=SecurityLog.Action.LOGOUT,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response({"detail": "Logged out."})


class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return ProfileUpdateSerializer
        return UserSerializer

    def retrieve(self, request, *args, **kwargs):
        data = UserSerializer(request.user).data
        data["vault_idle_lock_minutes"] = settings.VAULT_IDLE_LOCK_MINUTES
        return Response(data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        blacklist_user_tokens(request.user)
        log_security_event(
            user=request.user,
            action=SecurityLog.Action.PASSWORD_CHANGED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response({"detail": "Master password updated. Please sign in again."})


class Enable2FAView(APIView):
    """Send a one-time code to the user's account email to begin enabling 2FA."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        if request.user.two_factor_enabled:
            return Response(
                {"detail": "Email 2FA is already enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            issue_email_otp(request.user, EmailOTP.Purpose.ENABLE_2FA)
        except Exception:
            return Response(
                {"detail": "Could not send the verification email. Try again shortly."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "email_hint": _mask_email(request.user.email),
                "message": (
                    f"We sent a 6-digit code to {_mask_email(request.user.email)}. "
                    "Enter it to enable email two-factor authentication."
                ),
            }
        )


class Confirm2FAView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        raw = request.data.get("email_code") or request.data.get("totp_code", "")
        code = "".join(ch for ch in str(raw) if ch.isdigit())
        if not verify_email_otp(request.user, EmailOTP.Purpose.ENABLE_2FA, code):
            return Response(
                {"detail": "Invalid or expired email code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        TwoFactorAuthentication.objects.update_or_create(
            user=request.user,
            defaults={
                "encrypted_secret": "",
                "enabled": True,
                "confirmed_at": timezone.now(),
            },
        )
        request.user.two_factor_enabled = True
        request.user.save(update_fields=["two_factor_enabled", "updated_at"])
        log_security_event(
            user=request.user,
            action=SecurityLog.Action.TWO_FA_ENABLED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            metadata={"method": "email_otp"},
        )
        return Response(
            {
                "detail": "Email two-factor authentication enabled.",
                "user": UserSerializer(request.user).data,
            }
        )


class Disable2FAView(APIView):
    """
    With master password only: send a disable OTP to email.
    With master password + email_code: verify and disable.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        password = request.data.get("master_password", "")
        raw = request.data.get("email_code") or request.data.get("totp_code", "")
        code = "".join(ch for ch in str(raw) if ch.isdigit())

        if not request.user.check_password(password):
            return Response(
                {"detail": "Invalid master password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.two_factor_enabled:
            return Response(
                {"detail": "Email 2FA is not enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not code:
            try:
                issue_email_otp(request.user, EmailOTP.Purpose.DISABLE_2FA)
            except Exception:
                return Response(
                    {"detail": "Could not send the verification email."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return Response(
                {
                    "otp_sent": True,
                    "email_hint": _mask_email(request.user.email),
                    "message": (
                        f"We sent a code to {_mask_email(request.user.email)}. "
                        "Enter it with your master password to disable 2FA."
                    ),
                }
            )

        if not verify_email_otp(request.user, EmailOTP.Purpose.DISABLE_2FA, code):
            return Response(
                {"detail": "Invalid or expired email code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(request.user, "two_factor"):
            request.user.two_factor.delete()
        request.user.two_factor_enabled = False
        request.user.save(update_fields=["two_factor_enabled", "updated_at"])
        request.user.recovery_codes.all().delete()
        log_security_event(
            user=request.user,
            action=SecurityLog.Action.TWO_FA_DISABLED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            metadata={"method": "email_otp"},
        )
        return Response(
            {
                "detail": "Email two-factor authentication disabled.",
                "user": UserSerializer(request.user).data,
            }
        )


class ForgotPasswordRequestView(APIView):
    """Send a reset code to the account email (always returns a generic success)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").lower().strip()
        generic = {
            "detail": (
                "If an account exists for that email, we sent a 6-digit reset code. "
                "Check your inbox (and spam)."
            )
        }
        if not email:
            return Response(
                {"detail": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = User.objects.filter(email__iexact=email).first()
        if user and not user.is_staff and user.is_active and not user.is_locked():
            try:
                issue_email_otp(user, EmailOTP.Purpose.RESET_PASSWORD)
            except Exception:
                pass
        return Response(generic)


class ForgotPasswordResetView(APIView):
    """
    Verify email OTP and set a new master password + fresh vault wrap.
    Old ciphertext cannot be recovered — all vault credentials are deleted.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = ForgotPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower().strip()
        code = serializer.validated_data["email_code"]

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid reset request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_staff:
            return Response(
                {"detail": "Invalid reset request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.is_locked():
            return Response(
                {"detail": "Account temporarily locked."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not verify_email_otp(user, EmailOTP.Purpose.RESET_PASSWORD, code):
            user.register_failed_login(
                settings.ACCOUNT_LOCKOUT_ATTEMPTS,
                settings.ACCOUNT_LOCKOUT_MINUTES,
            )
            return Response(
                {"detail": "Invalid or expired email code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.kdf_salt = serializer.validated_data["kdf_salt"]
            user.encrypted_vault_key = serializer.validated_data["encrypted_vault_key"]
            user.vault_key_nonce = serializer.validated_data["vault_key_nonce"]
            user.failed_login_attempts = 0
            user.locked_until = None
            # Old DEK is gone — invalidate device biometric wraps tied to it.
            user.biometric_enabled = False
            user.save(
                update_fields=[
                    "password",
                    "kdf_salt",
                    "encrypted_vault_key",
                    "vault_key_nonce",
                    "failed_login_attempts",
                    "locked_until",
                    "biometric_enabled",
                    "updated_at",
                ]
            )
            Credential.objects.filter(user=user).delete()
            user.recovery_codes.all().delete()
            user.webauthn_credentials.all().delete()
            blacklist_user_tokens(user)

        log_security_event(
            user=user,
            action=SecurityLog.Action.PASSWORD_CHANGED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            metadata={"method": "forgot_password_email_otp", "vault_wiped": True},
        )
        return Response(
            {
                "detail": (
                    "Master password reset. Your previous vault data was wiped "
                    "because it could not be decrypted without the old password. "
                    "Sign in with your new master password."
                )
            }
        )


class DeleteAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        password = request.data.get("master_password", "")
        confirmation = request.data.get("confirmation", "")
        if confirmation != "DELETE":
            return Response(
                {"detail": 'Type DELETE to confirm account deletion.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(password):
            return Response(
                {"detail": "Invalid master password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user
        log_security_event(
            user=user,
            action=SecurityLog.Action.ACCOUNT_DELETED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        blacklist_user_tokens(user)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LoginHistoryListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = LoginHistory.objects.filter(user=request.user)[:50]
        return Response(
            [
                {
                    "id": str(row.id),
                    "ip_address": row.ip_address,
                    "user_agent": row.user_agent,
                    "success": row.success,
                    "failure_reason": row.failure_reason,
                    "created_at": row.created_at,
                }
                for row in rows
            ]
        )


class WebAuthnRegisterOptionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        from django.core.cache import cache

        from .webauthn_service import registration_options_for

        options = registration_options_for(request.user)
        cache.set(
            f"webauthn_reg:{request.user.id}",
            options["challenge"],
            timeout=300,
        )
        return Response(options)


class WebAuthnRegisterVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        from django.core.cache import cache

        from .webauthn_service import verify_and_store_registration

        challenge = cache.get(f"webauthn_reg:{request.user.id}")
        if not challenge:
            return Response(
                {"detail": "Registration challenge expired. Try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            cred = verify_and_store_registration(
                request.user,
                request.data.get("credential") or {},
                challenge,
                device_name=request.data.get("device_name") or "This device",
            )
        except Exception as exc:
            return Response(
                {"detail": f"Biometric registration failed: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(f"webauthn_reg:{request.user.id}")
        return Response(
            {
                "detail": "Biometric unlock enabled.",
                "credential_id": cred.credential_id,
                "user": UserSerializer(request.user).data,
            }
        )


class WebAuthnLoginOptionsView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        from django.core.cache import cache

        from .webauthn_service import authentication_options_for

        email = (request.data.get("email") or "").lower().strip()
        user = User.objects.filter(email__iexact=email).first()
        if (
            not user
            or user.is_staff
            or not user.is_active
            or not user.biometric_enabled
            or not user.webauthn_credentials.exists()
        ):
            return Response(
                {"detail": "Biometric unlock is not enabled for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_locked():
            return Response(
                {"detail": "Account temporarily locked."},
                status=status.HTTP_403_FORBIDDEN,
            )
        options = authentication_options_for(user)
        cache.set(f"webauthn_auth:{user.id}", options["challenge"], timeout=300)
        return Response({"options": options, "user_id": str(user.id)})


class WebAuthnLoginVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        from django.core.cache import cache

        from .webauthn_service import verify_authentication

        email = (request.data.get("email") or "").lower().strip()
        user = User.objects.filter(email__iexact=email).first()
        if not user or user.is_staff or not user.is_active:
            return Response(
                {"detail": "Invalid biometric login."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_locked():
            return Response(
                {"detail": "Account temporarily locked."},
                status=status.HTTP_403_FORBIDDEN,
            )
        challenge = cache.get(f"webauthn_auth:{user.id}")
        if not challenge:
            return Response(
                {"detail": "Biometric challenge expired. Try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            verify_authentication(
                user,
                request.data.get("credential") or {},
                challenge,
            )
        except Exception:
            user.register_failed_login(
                settings.ACCOUNT_LOCKOUT_ATTEMPTS,
                settings.ACCOUNT_LOCKOUT_MINUTES,
            )
            return Response(
                {"detail": "Biometric verification failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        cache.delete(f"webauthn_auth:{user.id}")

        # Email 2FA still applies after biometric proof — biometrics must not
        # short-circuit the second factor when it is enabled.
        if user.two_factor_enabled:
            try:
                issue_email_otp(user, EmailOTP.Purpose.LOGIN_2FA)
            except Exception:
                return Response(
                    {
                        "detail": (
                            "Could not send the verification email. "
                            "Check email settings or try again shortly."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return Response(
                {
                    "requires_2fa": True,
                    "pre_auth_token": issue_pre_2fa_token(user),
                    "email_hint": _mask_email(user.email),
                    "user": {
                        "id": str(user.id),
                        "email": user.email,
                        "name": user.name,
                    },
                    "vault_idle_lock_minutes": settings.VAULT_IDLE_LOCK_MINUTES,
                }
            )

        user.clear_failed_logins()
        LoginHistory.objects.create(
            user=user,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            success=True,
            failure_reason="biometric",
        )
        log_security_event(
            user=user,
            action=SecurityLog.Action.LOGIN_SUCCESS,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            metadata={"method": "webauthn"},
        )
        return Response(
            {
                "requires_2fa": False,
                "tokens": issue_session_tokens(user),
                "user": {
                    **UserSerializer(user).data,
                    "encrypted_vault_key": user.encrypted_vault_key,
                    "vault_key_nonce": user.vault_key_nonce,
                },
                "vault_idle_lock_minutes": settings.VAULT_IDLE_LOCK_MINUTES,
            }
        )


class WebAuthnDisableView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        password = request.data.get("master_password", "")
        if not request.user.check_password(password):
            return Response(
                {"detail": "Invalid master password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.webauthn_credentials.all().delete()
        request.user.biometric_enabled = False
        request.user.save(update_fields=["biometric_enabled", "updated_at"])
        return Response(
            {
                "detail": "Biometric unlock disabled.",
                "user": UserSerializer(request.user).data,
            }
        )
