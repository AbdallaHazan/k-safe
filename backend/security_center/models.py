import uuid

from django.conf import settings
from django.db import models


class SecurityLog(models.Model):
    class Action(models.TextChoices):
        REGISTER = "register", "Register"
        LOGIN_SUCCESS = "login_success", "Login success"
        LOGIN_FAILED = "login_failed", "Login failed"
        LOGOUT = "logout", "Logout"
        PASSWORD_CHANGED = "password_changed", "Password changed"
        TWO_FA_ENABLED = "2fa_enabled", "2FA enabled"
        TWO_FA_DISABLED = "2fa_disabled", "2FA disabled"
        CREDENTIAL_CREATED = "credential_created", "Credential created"
        CREDENTIAL_UPDATED = "credential_updated", "Credential updated"
        CREDENTIAL_DELETED = "credential_deleted", "Credential deleted"
        CREDENTIAL_REVEALED = "credential_revealed", "Credential revealed"
        VAULT_EXPORTED = "vault_exported", "Vault exported"
        VAULT_IMPORTED = "vault_imported", "Vault imported"
        ACCOUNT_DELETED = "account_deleted", "Account deleted"
        SUSPICIOUS = "suspicious", "Suspicious activity"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="security_logs",
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=64, choices=Action.choices)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["user", "-timestamp"]),
            models.Index(fields=["action", "-timestamp"]),
        ]

    def __str__(self):
        return f"{self.action} @ {self.timestamp}"
