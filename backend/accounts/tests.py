"""
API smoke tests for KeySafe auth + vault security invariants.
Run: python manage.py test accounts vault
"""

import re

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from accounts.security import issue_pre_2fa_token
from vault.encryption import encrypt, generate_key
from vault.models import Credential


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class AuthSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "Str0ng!Passw0rd"
        self.user = User.objects.create_user(
            email="alice@example.com",
            name="Alice",
            password=self.password,
            kdf_salt="a" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="b" * 24,
            biometric_enabled=True,
        )

    def test_register_requires_vault_wrap_fields(self):
        res = self.client.post(
            "/api/register",
            {
                "name": "Bob",
                "email": "bob@example.com",
                "master_password": "Short",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_login_without_2fa_returns_vault_material(self):
        res = self.client.post(
            "/api/login",
            {"email": self.user.email, "master_password": self.password},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["requires_2fa"])
        self.assertIn("encrypted_vault_key", res.data["user"])
        self.assertIn("tokens", res.data)

    def test_pending_user_login_rejected(self):
        pending = User.objects.create_user(
            email="pending-login@example.com",
            name="Pending Login",
            password=self.password,
            kdf_salt="p" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="q" * 24,
            biometric_enabled=False,
        )
        res = self.client.post(
            "/api/login",
            {"email": pending.email, "master_password": self.password},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("administrator", res.data["detail"].lower())
        self.assertNotIn("tokens", res.data)

    def test_register_returns_onboarding_session(self):
        res = self.client.post(
            "/api/register",
            {
                "name": "New User",
                "email": "newuser@example.com",
                "master_password": "Str0ng!Passw0rd",
                "kdf_salt": "a" * 32,
                "encrypted_vault_key": "dGVzdA==",
                "vault_key_nonce": "b" * 24,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["requires_biometric_setup"])
        self.assertIn("tokens", res.data)
        self.assertIn("encrypted_vault_key", res.data["user"])
        self.assertFalse(res.data["user"]["biometric_enabled"])

    def test_login_with_2fa_hides_vault_keys(self):
        self.user.two_factor_enabled = True
        self.user.save(update_fields=["two_factor_enabled"])
        res = self.client.post(
            "/api/login",
            {"email": self.user.email, "master_password": self.password},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["requires_2fa"])
        self.assertIn("pre_auth_token", res.data)
        self.assertNotIn("encrypted_vault_key", res.data["user"])
        self.assertNotIn("kdf_salt", res.data["user"])

    def test_verify_2fa_requires_pre_auth_token(self):
        self.user.two_factor_enabled = True
        self.user.save(update_fields=["two_factor_enabled"])
        res = self.client.post(
            "/api/verify-2fa",
            {"email": self.user.email, "totp_code": "123456"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_pre_2fa_token_cannot_access_vault(self):
        token = issue_pre_2fa_token(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        res = self.client.get("/api/vault")
        self.assertIn(res.status_code, (401, 403))


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class AdminApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "Str0ng!Passw0rd"
        self.staff = User.objects.create_user(
            email="admin@example.com",
            name="Admin",
            password=self.password,
            kdf_salt="e" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="f" * 24,
            is_staff=True,
            biometric_enabled=True,
        )
        self.pending = User.objects.create_user(
            email="pending@example.com",
            name="Pending",
            password=self.password,
            kdf_salt="1" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="2" * 24,
            biometric_enabled=False,
        )
        login = self.client.post(
            "/api/admin/login",
            {"email": self.staff.email, "password": self.password},
            format="json",
        )
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        verified = self.client.post(
            "/api/admin/login/verify",
            {
                "email": self.staff.email,
                "email_code": code,
                "pre_auth_token": login.data["pre_auth_token"],
            },
            format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.data)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {verified.data['tokens']['access']}"
        )

    def test_non_staff_forbidden(self):
        self.client.credentials()
        other = User.objects.create_user(
            email="user@example.com",
            name="User",
            password=self.password,
            kdf_salt="3" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="4" * 24,
            biometric_enabled=True,
        )
        login = self.client.post(
            "/api/login",
            {"email": other.email, "master_password": self.password},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login.data['tokens']['access']}"
        )
        res = self.client.get("/api/admin/stats")
        self.assertIn(res.status_code, (401, 403))

    def test_staff_cannot_use_user_vault_login(self):
        self.client.credentials()
        res = self.client.post(
            "/api/login",
            {"email": self.staff.email, "master_password": self.password},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_stats_and_pending_status(self):
        res = self.client.get("/api/admin/stats")
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data["users_pending"], 1)
        listed = self.client.get("/api/admin/users?status=pending")
        self.assertEqual(listed.status_code, 200)
        emails = [u["email"] for u in listed.data["results"]]
        self.assertIn(self.pending.email, emails)
        detail = self.client.get(f"/api/admin/users/{self.pending.id}")
        self.assertEqual(detail.data["status"], "pending")


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
)
class VaultSoftDeleteTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="vault@example.com",
            name="Vault",
            password="Str0ng!Passw0rd",
            kdf_salt="c" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="d" * 24,
            biometric_enabled=True,
        )
        login = self.client.post(
            "/api/login",
            {"email": self.user.email, "master_password": "Str0ng!Passw0rd"},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login.data['tokens']['access']}"
        )
        key = generate_key()
        self.credential = Credential.objects.create(
            user=self.user,
            encrypted_title=encrypt("Title", key),
            encrypted_password=encrypt("secret", key),
            encrypted_website=encrypt("https://example.com", key),
            website_host="example.com",
            password_strength=80,
        )

    def test_delete_soft_deletes_and_hides_from_list(self):
        res = self.client.delete(f"/api/vault/{self.credential.id}")
        self.assertEqual(res.status_code, 204)
        self.credential.refresh_from_db()
        self.assertTrue(self.credential.is_deleted)
        listed = self.client.get("/api/vault")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data, [])
        trash = self.client.get("/api/vault/trash")
        self.assertEqual(len(trash.data), 1)

    def test_restore_from_trash(self):
        self.credential.soft_delete()
        res = self.client.post(f"/api/vault/{self.credential.id}/restore")
        self.assertEqual(res.status_code, 200)
        self.credential.refresh_from_db()
        self.assertFalse(self.credential.is_deleted)


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class AdminSiteOTPGateTests(TestCase):
    """Django's built-in /admin/ must not bypass the email-OTP second factor."""

    def setUp(self):
        cache.clear()
        self.password = "Str0ng!Passw0rd"
        self.staff = User.objects.create_user(
            email="djadmin@example.com",
            name="Admin",
            password=self.password,
            kdf_salt="9" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="9" * 24,
            is_staff=True,
            is_superuser=True,
        )

    def test_session_login_redirects_to_otp_before_reaching_admin_pages(self):
        logged_in = self.client.login(username=self.staff.email, password=self.password)
        self.assertTrue(logged_in)

        res = self.client.get("/admin/", follow=False)
        self.assertEqual(res.status_code, 302)
        self.assertIn("/admin/verify-otp/", res.url)

        # An email OTP should have been sent as part of the session login signal.
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)

        wrong = self.client.post("/admin/verify-otp/", {"code": "000000"})
        self.assertEqual(wrong.status_code, 200)
        self.assertContains(wrong, "Invalid or expired code")

        still_blocked = self.client.get("/admin/")
        self.assertEqual(still_blocked.status_code, 302)

        verified = self.client.post("/admin/verify-otp/", {"code": code}, follow=True)
        self.assertEqual(verified.status_code, 200)

        allowed = self.client.get("/admin/")
        self.assertEqual(allowed.status_code, 200)

    def test_non_staff_session_login_is_not_gated(self):
        regular = User.objects.create_user(
            email="regular@example.com",
            name="Regular",
            password=self.password,
            kdf_salt="8" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="8" * 24,
            is_staff=False,
        )
        self.client.login(username=regular.email, password=self.password)
        # No OTP email should be triggered for a non-staff session login.
        self.assertEqual(len(mail.outbox), 0)


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class WebAuthnAndResetSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "Str0ng!Passw0rd"
        self.staff = User.objects.create_user(
            email="bioadmin@example.com",
            name="Bio Admin",
            password=self.password,
            kdf_salt="a" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="b" * 24,
            is_staff=True,
            biometric_enabled=True,
        )
        self.user = User.objects.create_user(
            email="biouser@example.com",
            name="Bio User",
            password=self.password,
            kdf_salt="c" * 32,
            encrypted_vault_key="dGVzdA==",
            vault_key_nonce="d" * 24,
            biometric_enabled=True,
        )

    def test_staff_cannot_start_webauthn_vault_login(self):
        res = self.client.post(
            "/api/webauthn/login/options",
            {"email": self.staff.email},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_inactive_user_cannot_start_webauthn_login(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        res = self.client.post(
            "/api/webauthn/login/options",
            {"email": self.user.email},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_forgot_password_disables_biometric(self):
        from accounts.models import WebAuthnCredential

        WebAuthnCredential.objects.create(
            user=self.user,
            credential_id="dGVzdC1jcmVk",
            public_key="dGVzdC1wdWJrZXk",
            sign_count=0,
            device_name="test",
        )
        req = self.client.post(
            "/api/forgot-password",
            {"email": self.user.email},
            format="json",
        )
        self.assertEqual(req.status_code, 200)
        code = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        reset = self.client.post(
            "/api/forgot-password/reset",
            {
                "email": self.user.email,
                "email_code": code,
                "new_password": "N3w!Passw0rd",
                "kdf_salt": "e" * 32,
                "encrypted_vault_key": "bmV3a2V5",
                "vault_key_nonce": "f" * 24,
            },
            format="json",
        )
        self.assertEqual(reset.status_code, 200, reset.data)
        self.user.refresh_from_db()
        self.assertFalse(self.user.biometric_enabled)
        self.assertEqual(self.user.webauthn_credentials.count(), 0)
