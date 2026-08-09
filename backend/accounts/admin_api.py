"""
Staff-only system admin API.

Lifecycle status (strongest signal for ops):
- pending:  account exists but biometric onboarding not done (not a "real" user yet)
- locked:   lockout window active
- inactive: admin-disabled
- active:   biometric enabled, usable account
"""

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework.response import Response
from rest_framework.views import APIView

from security_center.models import SecurityLog
from vault.models import Category, Credential

from .email_otp import issue_email_otp, verify_email_otp
from .models import EmailOTP, LoginHistory, User, WebAuthnCredential
from .security import (
    AdminJWTAuthentication,
    blacklist_user_tokens,
    issue_admin_pre_auth_token,
    issue_admin_session_tokens,
)
from .throttles import LoginRateThrottle, SensitiveActionThrottle


def compute_user_status(user: User) -> str:
    if not user.is_active:
        return "inactive"
    if user.is_locked():
        return "locked"
    if not user.biometric_enabled:
        return "pending"
    return "active"


def user_admin_payload(user: User, *, include_history: bool = False) -> dict:
    credential_count = Credential.objects.filter(user=user).count()
    category_count = Category.objects.filter(user=user).count()
    payload = {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "status": compute_user_status(user),
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "two_factor_enabled": user.two_factor_enabled,
        "biometric_enabled": user.biometric_enabled,
        "email_verified": user.email_verified,
        "failed_login_attempts": user.failed_login_attempts,
        "locked_until": user.locked_until.isoformat() if user.locked_until else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
        "credential_count": credential_count,
        "category_count": category_count,
    }
    if include_history:
        history = LoginHistory.objects.filter(user=user).order_by("-created_at")[:20]
        payload["login_history"] = [
            {
                "id": str(row.id),
                "ip_address": row.ip_address,
                "user_agent": row.user_agent[:200],
                "success": row.success,
                "failure_reason": row.failure_reason,
                "created_at": row.created_at.isoformat(),
            }
            for row in history
        ]
    return payload


class IsStaffUser(permissions.BasePermission):
    def has_permission(self, request, view):
        token = getattr(request, "auth", None)
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
            and request.user.is_active
            and token
            and token.get("admin_session") is True
        )


class AdminLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.is_staff or not user.is_active:
            return Response(
                {"detail": "Invalid admin credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if user.is_locked():
            return Response(
                {"detail": "Admin account temporarily locked."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not user.check_password(password):
            user.register_failed_login(5, 15)
            return Response(
                {"detail": "Invalid admin credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            issue_email_otp(user, EmailOTP.Purpose.ADMIN_LOGIN)
        except Exception as exc:
            # Surface a short SMTP reason so misconfigured Render env vars
            # are diagnosable without shell access (no secrets included).
            reason = str(exc).strip() or exc.__class__.__name__
            if len(reason) > 180:
                reason = reason[:177] + "..."
            return Response(
                {
                    "detail": (
                        "Could not send admin verification email. "
                        f"SMTP error: {reason}"
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "pre_auth_token": issue_admin_pre_auth_token(user),
                "email": user.email,
                "detail": "A 6-digit admin code was sent to your email.",
            }
        )


class AdminLoginVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        code = "".join(ch for ch in str(request.data.get("email_code") or "") if ch.isdigit())
        raw_token = request.data.get("pre_auth_token") or ""
        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.is_staff or not user.is_active:
            return Response(
                {"detail": "Invalid admin verification request."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            token = AccessToken(raw_token)
            valid_pre_auth = (
                token.get("admin_pre_auth") is True
                and str(token.get("user_id")) == str(user.id)
            )
        except Exception:
            valid_pre_auth = False
        if not valid_pre_auth:
            return Response(
                {"detail": "Invalid or expired admin verification session."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not verify_email_otp(user, EmailOTP.Purpose.ADMIN_LOGIN, code):
            user.register_failed_login(5, 15)
            return Response(
                {"detail": "Invalid or expired admin code."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        user.clear_failed_logins()
        return Response(
            {
                "tokens": issue_admin_session_tokens(user),
                "admin": {
                    "id": str(user.id),
                    "email": user.email,
                    "name": user.name,
                    "is_superuser": user.is_superuser,
                },
            }
        )


class AdminStatsView(APIView):
    authentication_classes = [AdminJWTAuthentication]
    permission_classes = [IsStaffUser]

    def get(self, request):
        now = timezone.now()
        # System-admin identities are excluded from end-user lifecycle metrics.
        users = User.objects.filter(is_staff=False)
        total = users.count()
        inactive = users.filter(is_active=False).count()
        locked = users.filter(is_active=True, locked_until__gt=now).count()
        pending = users.filter(
            is_active=True,
        ).filter(
            Q(locked_until__isnull=True) | Q(locked_until__lte=now),
            biometric_enabled=False,
        ).count()
        active = users.filter(
            is_active=True,
            biometric_enabled=True,
        ).filter(
            Q(locked_until__isnull=True) | Q(locked_until__lte=now),
        ).count()
        staff = User.objects.filter(is_staff=True).count()

        recent_logs = SecurityLog.objects.select_related("user").order_by("-timestamp")[
            :15
        ]
        recent_fails = LoginHistory.objects.filter(success=False).select_related(
            "user"
        ).order_by("-created_at")[:10]

        return Response(
            {
                "users_total": total,
                "users_pending": pending,
                "users_active": active,
                "users_locked": locked,
                "users_inactive": inactive,
                "users_staff": staff,
                "credentials_total": Credential.objects.count(),
                "categories_total": Category.objects.count(),
                "recent_security_logs": [
                    {
                        "id": str(log.id),
                        "action": log.action,
                        "user_email": log.user.email if log.user_id else None,
                        "ip_address": log.ip_address,
                        "created_at": log.timestamp.isoformat(),
                    }
                    for log in recent_logs
                ],
                "recent_failed_logins": [
                    {
                        "id": str(row.id),
                        "user_email": row.user.email,
                        "ip_address": row.ip_address,
                        "failure_reason": row.failure_reason,
                        "created_at": row.created_at.isoformat(),
                    }
                    for row in recent_fails
                ],
            }
        )


class AdminUserListView(APIView):
    authentication_classes = [AdminJWTAuthentication]
    permission_classes = [IsStaffUser]

    def get(self, request):
        qs = User.objects.filter(is_staff=False).order_by("-created_at")
        q = (request.query_params.get("q") or "").strip()
        status_filter = (request.query_params.get("status") or "").strip().lower()

        if q:
            qs = qs.filter(Q(email__icontains=q) | Q(name__icontains=q))

        # Annotate counts for list efficiency
        qs = qs.annotate(
            credential_count=Count("credentials", distinct=True),
            category_count=Count("categories", distinct=True),
        )

        results = []
        for user in qs[:500]:
            st = compute_user_status(user)
            if status_filter and status_filter != "all" and st != status_filter:
                continue
            results.append(
                {
                    "id": str(user.id),
                    "email": user.email,
                    "name": user.name,
                    "status": st,
                    "is_active": user.is_active,
                    "is_staff": user.is_staff,
                    "is_superuser": user.is_superuser,
                    "two_factor_enabled": user.two_factor_enabled,
                    "biometric_enabled": user.biometric_enabled,
                    "email_verified": user.email_verified,
                    "failed_login_attempts": user.failed_login_attempts,
                    "locked_until": (
                        user.locked_until.isoformat() if user.locked_until else None
                    ),
                    "last_login_at": (
                        user.last_login_at.isoformat() if user.last_login_at else None
                    ),
                    "created_at": user.created_at.isoformat(),
                    "updated_at": user.updated_at.isoformat(),
                    "credential_count": user.credential_count,
                    "category_count": user.category_count,
                }
            )

        return Response({"count": len(results), "results": results})


class AdminUserDetailView(APIView):
    authentication_classes = [AdminJWTAuthentication]
    permission_classes = [IsStaffUser]

    def get(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if user.is_staff:
            return Response(
                {"detail": "Admin identities are not managed as vault users."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(user_admin_payload(user, include_history=True))

    def delete(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if user.is_staff:
            return Response(
                {"detail": "Admin identities are managed from the server CLI."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user.id == request.user.id:
            return Response(
                {"detail": "You cannot delete your own account from admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.is_superuser and not request.user.is_superuser:
            return Response(
                {"detail": "Only a superuser can delete another superuser."},
                status=status.HTTP_403_FORBIDDEN,
            )
        blacklist_user_tokens(user)
        email = user.email
        user.delete()
        return Response({"detail": f"Deleted user {email}."})


class AdminUserActionView(APIView):
    authentication_classes = [AdminJWTAuthentication]
    permission_classes = [IsStaffUser]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request, user_id, action):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if user.is_staff:
            return Response(
                {"detail": "Admin identities are managed from the server CLI."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if action == "deactivate":
            if user.id == request.user.id:
                return Response(
                    {"detail": "You cannot deactivate yourself."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.is_active = False
            user.save(update_fields=["is_active", "updated_at"])
            blacklist_user_tokens(user)
            return Response(user_admin_payload(user))

        if action == "activate":
            user.is_active = True
            user.save(update_fields=["is_active", "updated_at"])
            return Response(user_admin_payload(user))

        if action == "unlock":
            user.failed_login_attempts = 0
            user.locked_until = None
            user.save(
                update_fields=["failed_login_attempts", "locked_until", "updated_at"]
            )
            return Response(user_admin_payload(user))

        if action == "force-logout":
            blacklist_user_tokens(user)
            return Response(
                {
                    "detail": "All refresh tokens revoked.",
                    "user": user_admin_payload(user),
                }
            )

        if action == "reset-onboarding":
            user.biometric_enabled = False
            user.save(update_fields=["biometric_enabled", "updated_at"])
            WebAuthnCredential.objects.filter(user=user).delete()
            return Response(user_admin_payload(user))

        return Response(
            {"detail": f"Unknown action: {action}"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class AdminSecurityLogsView(APIView):
    authentication_classes = [AdminJWTAuthentication]
    permission_classes = [IsStaffUser]

    def get(self, request):
        qs = SecurityLog.objects.select_related("user").order_by("-timestamp")
        action = (request.query_params.get("action") or "").strip()
        email = (request.query_params.get("email") or "").strip()
        if action:
            qs = qs.filter(action__icontains=action)
        if email:
            qs = qs.filter(user__email__icontains=email)
        rows = list(qs[:200])
        return Response(
            {
                "count": len(rows),
                "results": [
                    {
                        "id": str(log.id),
                        "action": log.action,
                        "user_email": log.user.email if log.user_id else None,
                        "ip_address": log.ip_address,
                        "user_agent": (log.user_agent or "")[:200],
                        "metadata": log.metadata,
                        "created_at": log.timestamp.isoformat(),
                    }
                    for log in rows
                ],
            }
        )
