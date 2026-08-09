import getpass
import secrets

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from accounts.models import User


class Command(BaseCommand):
    help = "Create a dedicated system-admin identity (not a vault user)."

    def add_arguments(self, parser):
        parser.add_argument("email", type=str)
        parser.add_argument("--name", default="System Administrator")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError("That email is already used. Admin identity must be separate.")

        password = getpass.getpass("Admin password: ")
        confirm = getpass.getpass("Confirm admin password: ")
        if password != confirm:
            raise CommandError("Passwords do not match.")
        if len(password) < 12:
            raise CommandError("Admin password must be at least 12 characters.")
        candidate = User(email=email, name=options["name"])
        try:
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        user = User.objects.create_user(
            email=email,
            name=options["name"],
            password=password,
            # Required schema fields; admin sessions never receive or use these values.
            kdf_salt=secrets.token_hex(16),
            encrypted_vault_key="ADMIN_IDENTITY_NO_VAULT",
            vault_key_nonce=secrets.token_hex(12),
            is_staff=True,
            is_superuser=True,
            is_active=True,
            biometric_enabled=False,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Created dedicated system admin {user.email}. Sign in at /admin/login."
            )
        )
