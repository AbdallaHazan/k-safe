import secrets

from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .models import RecoveryCode, User, generate_recovery_code


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "name",
            "avatar",
            "two_factor_enabled",
            "biometric_enabled",
            "email_verified",
            "is_active",
            "is_staff",
            "is_superuser",
            "created_at",
            "updated_at",
            "last_login_at",
            "kdf_salt",
        )
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    """
    Registration payload.

    Client responsibilities (zero-knowledge):
    1. Generate a random vault DEK (32 bytes).
    2. Derive a key from master_password + kdf_salt via Argon2id.
    3. Wrap (encrypt) the DEK → encrypted_vault_key + vault_key_nonce.
    4. Send wrapped DEK + salt; never send the raw DEK.
    """

    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    master_password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    kdf_salt = serializers.RegexField(
        regex=r"^[0-9a-fA-F]{32,64}$",
        help_text="Hex-encoded salt (16–32 bytes) generated on the client.",
    )
    encrypted_vault_key = serializers.CharField(max_length=2048)
    vault_key_nonce = serializers.RegexField(regex=r"^[0-9a-fA-F]{24}$")

    def validate_email(self, value):
        email = value.lower().strip()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate_master_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("master_password")
        user = User(
            name=validated_data["name"].strip(),
            email=validated_data["email"],
            kdf_salt=validated_data["kdf_salt"].lower(),
            encrypted_vault_key=validated_data["encrypted_vault_key"],
            vault_key_nonce=validated_data["vault_key_nonce"].lower(),
        )
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    master_password = serializers.CharField(write_only=True, max_length=128)

    def validate(self, attrs):
        email = attrs["email"].lower().strip()
        password = attrs["master_password"]
        request = self.context.get("request")

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Constant-ish path: still run authenticate against a dummy to
            # reduce user-enumeration timing differences.
            authenticate(
                request=request,
                username=email,
                password=password,
            )
            raise serializers.ValidationError("Invalid email or password.")

        if user.is_locked():
            raise serializers.ValidationError(
                "Account temporarily locked due to failed login attempts. "
                "Try again later."
            )

        if not user.is_active:
            raise serializers.ValidationError("This account has been disabled.")

        authenticated = authenticate(
            request=request,
            username=user.email,
            password=password,
        )
        if authenticated is None:
            raise serializers.ValidationError("Invalid email or password.")

        attrs["user"] = authenticated
        return attrs


class Verify2FASerializer(serializers.Serializer):
    email = serializers.EmailField()
    email_code = serializers.CharField(required=False, allow_blank=True)
    # Backward-compatible alias
    totp_code = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        code = attrs.get("email_code") or attrs.get("totp_code")
        if not code:
            raise serializers.ValidationError("Provide the email verification code.")
        attrs["email_code"] = "".join(ch for ch in str(code) if ch.isdigit())
        return attrs


class ForgotPasswordResetSerializer(serializers.Serializer):
    """
    After email OTP verification, client sends a NEW wrapped vault DEK.
    Old credentials cannot be decrypted and are deleted.
    """

    email = serializers.EmailField()
    email_code = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    kdf_salt = serializers.RegexField(regex=r"^[0-9a-fA-F]{32,64}$")
    encrypted_vault_key = serializers.CharField(max_length=2048)
    vault_key_nonce = serializers.RegexField(regex=r"^[0-9a-fA-F]{24}$")

    def validate_new_password(self, value):
        validate_password(value)
        return value

    def validate_email_code(self, value):
        return "".join(ch for ch in str(value) if ch.isdigit())


class ChangePasswordSerializer(serializers.Serializer):
    """
    Master password change requires re-wrapping the vault DEK on the client.
    """

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    encrypted_vault_key = serializers.CharField(max_length=2048)
    vault_key_nonce = serializers.RegexField(regex=r"^[0-9a-fA-F]{24}$")
    kdf_salt = serializers.RegexField(regex=r"^[0-9a-fA-F]{32,64}$")

    def validate_new_password(self, value):
        validate_password(value, user=self.context["request"].user)
        return value

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError(
                {"current_password": "Current password is incorrect."}
            )
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.encrypted_vault_key = self.validated_data["encrypted_vault_key"]
        user.vault_key_nonce = self.validated_data["vault_key_nonce"].lower()
        user.kdf_salt = self.validated_data["kdf_salt"].lower()
        user.save(
            update_fields=[
                "password",
                "encrypted_vault_key",
                "vault_key_nonce",
                "kdf_salt",
                "updated_at",
            ]
        )
        return user


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("name", "avatar")


def issue_recovery_codes(user: User, count: int = 10) -> list[str]:
    """
    Generate one-time recovery codes. Returns plaintext codes ONCE.
    Only Argon2id hashes are persisted.
    """
    RecoveryCode.objects.filter(user=user, used_at__isnull=True).delete()
    plain_codes: list[str] = []
    objects = []
    for _ in range(count):
        code = generate_recovery_code()
        plain_codes.append(code)
        objects.append(
            RecoveryCode(user=user, code_hash=make_password(code, hasher="argon2"))
        )
    RecoveryCode.objects.bulk_create(objects)
    return plain_codes


def consume_recovery_code(user: User, code: str) -> bool:
    for recovery in RecoveryCode.objects.filter(user=user, used_at__isnull=True):
        if check_password(code.strip().upper(), recovery.code_hash):
            recovery.used_at = timezone.now()
            recovery.save(update_fields=["used_at"])
            return True
    return False


def new_kdf_salt() -> str:
    return secrets.token_hex(16)
