from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .admin_api import (
    AdminLoginVerifyView,
    AdminLoginView,
    AdminSecurityLogsView,
    AdminStatsView,
    AdminUserActionView,
    AdminUserDetailView,
    AdminUserListView,
)
from .views import (
    ChangePasswordView,
    Confirm2FAView,
    DeleteAccountView,
    Disable2FAView,
    Enable2FAView,
    ForgotPasswordRequestView,
    ForgotPasswordResetView,
    LoginHistoryListView,
    LoginView,
    LogoutView,
    ProfileView,
    RegisterView,
    Verify2FAView,
    WebAuthnDisableView,
    WebAuthnLoginOptionsView,
    WebAuthnLoginVerifyView,
    WebAuthnRegisterOptionsView,
    WebAuthnRegisterVerifyView,
)

urlpatterns = [
    path("admin/login", AdminLoginView.as_view(), name="admin-login"),
    path(
        "admin/login/verify",
        AdminLoginVerifyView.as_view(),
        name="admin-login-verify",
    ),
    path("register", RegisterView.as_view(), name="register"),
    path("login", LoginView.as_view(), name="login"),
    path("logout", LogoutView.as_view(), name="logout"),
    path("verify-2fa", Verify2FAView.as_view(), name="verify-2fa"),
    path("forgot-password", ForgotPasswordRequestView.as_view(), name="forgot-password"),
    path(
        "forgot-password/reset",
        ForgotPasswordResetView.as_view(),
        name="forgot-password-reset",
    ),
    path("token/refresh", TokenRefreshView.as_view(), name="token-refresh"),
    path("profile", ProfileView.as_view(), name="profile"),
    path("change-password", ChangePasswordView.as_view(), name="change-password"),
    path("enable-2fa", Enable2FAView.as_view(), name="enable-2fa"),
    path("confirm-2fa", Confirm2FAView.as_view(), name="confirm-2fa"),
    path("disable-2fa", Disable2FAView.as_view(), name="disable-2fa"),
    path("delete-account", DeleteAccountView.as_view(), name="delete-account"),
    path("login-history", LoginHistoryListView.as_view(), name="login-history"),
    path(
        "webauthn/register/options",
        WebAuthnRegisterOptionsView.as_view(),
        name="webauthn-register-options",
    ),
    path(
        "webauthn/register/verify",
        WebAuthnRegisterVerifyView.as_view(),
        name="webauthn-register-verify",
    ),
    path(
        "webauthn/login/options",
        WebAuthnLoginOptionsView.as_view(),
        name="webauthn-login-options",
    ),
    path(
        "webauthn/login/verify",
        WebAuthnLoginVerifyView.as_view(),
        name="webauthn-login-verify",
    ),
    path("webauthn/disable", WebAuthnDisableView.as_view(), name="webauthn-disable"),
    # System admin (staff only)
    path("admin/stats", AdminStatsView.as_view(), name="admin-stats"),
    path("admin/users", AdminUserListView.as_view(), name="admin-users"),
    path(
        "admin/users/<uuid:user_id>",
        AdminUserDetailView.as_view(),
        name="admin-user-detail",
    ),
    path(
        "admin/users/<uuid:user_id>/<str:action>",
        AdminUserActionView.as_view(),
        name="admin-user-action",
    ),
    path(
        "admin/security-logs",
        AdminSecurityLogsView.as_view(),
        name="admin-security-logs",
    ),
]
