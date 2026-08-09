# Generated manually for SecurityLog.VAULT_IMPORTED

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("security_center", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="securitylog",
            name="action",
            field=models.CharField(
                choices=[
                    ("register", "Register"),
                    ("login_success", "Login success"),
                    ("login_failed", "Login failed"),
                    ("logout", "Logout"),
                    ("password_changed", "Password changed"),
                    ("2fa_enabled", "2FA enabled"),
                    ("2fa_disabled", "2FA disabled"),
                    ("credential_created", "Credential created"),
                    ("credential_updated", "Credential updated"),
                    ("credential_deleted", "Credential deleted"),
                    ("credential_revealed", "Credential revealed"),
                    ("vault_exported", "Vault exported"),
                    ("vault_imported", "Vault imported"),
                    ("account_deleted", "Account deleted"),
                    ("suspicious", "Suspicious activity"),
                ],
                max_length=64,
            ),
        ),
    ]
