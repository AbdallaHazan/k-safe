from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import EmailOTP, LoginHistory, RecoveryCode, TwoFactorAuthentication, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "name", "two_factor_enabled", "is_staff", "created_at")
    search_fields = ("email", "name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("name", "avatar")}),
        (
            "Vault key material",
            {
                "fields": ("kdf_salt", "encrypted_vault_key", "vault_key_nonce"),
                "classes": ("collapse",),
            },
        ),
        (
            "Security",
            {
                "fields": (
                    "two_factor_enabled",
                    "failed_login_attempts",
                    "locked_until",
                    "email_verified",
                )
            },
        ),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Dates", {"fields": ("last_login", "last_login_at", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "name",
                    "password1",
                    "password2",
                    "kdf_salt",
                    "encrypted_vault_key",
                    "vault_key_nonce",
                    "is_staff",
                    "is_superuser",
                ),
            },
        ),
    )
    readonly_fields = ("created_at", "updated_at", "last_login", "last_login_at")
    filter_horizontal = ("groups", "user_permissions")


@admin.register(TwoFactorAuthentication)
class TwoFactorAdmin(admin.ModelAdmin):
    list_display = ("user", "enabled", "confirmed_at", "created_at")
    search_fields = ("user__email",)


@admin.register(EmailOTP)
class EmailOTPAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "expires_at", "used_at", "created_at")
    list_filter = ("purpose",)
    search_fields = ("user__email",)


@admin.register(RecoveryCode)
class RecoveryCodeAdmin(admin.ModelAdmin):
    list_display = ("user", "used_at", "created_at")
    search_fields = ("user__email",)


@admin.register(LoginHistory)
class LoginHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "success", "ip_address", "created_at")
    list_filter = ("success",)
    search_fields = ("user__email", "ip_address")
