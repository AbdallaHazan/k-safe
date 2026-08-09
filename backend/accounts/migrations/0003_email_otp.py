# Generated manually for EmailOTP + optional TOTP secret

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_user_biometric_enabled_webauthncredential"),
    ]

    operations = [
        migrations.AlterField(
            model_name="twofactorauthentication",
            name="encrypted_secret",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.CreateModel(
            name="EmailOTP",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "purpose",
                    models.CharField(
                        choices=[
                            ("enable_2fa", "Enable 2FA"),
                            ("disable_2fa", "Disable 2FA"),
                            ("login_2fa", "Login 2FA"),
                            ("reset_password", "Reset password"),
                        ],
                        max_length=32,
                    ),
                ),
                ("code_hash", models.CharField(max_length=255)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="email_otps",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["user", "purpose", "used_at"],
                        name="accounts_em_user_id_purpose_idx",
                    ),
                ],
            },
        ),
    ]
