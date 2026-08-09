from rest_framework import serializers

from .models import Category, Credential


class CategorySerializer(serializers.ModelSerializer):
    credential_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "is_default",
            "credential_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "is_default", "created_at", "updated_at")

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Category name is required.")
        user = self.context["request"].user
        qs = Category.objects.filter(user=user, name__iexact=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("You already have this category.")
        return name

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class CredentialSerializer(serializers.ModelSerializer):
    category_id = serializers.UUIDField(
        source="category.id", read_only=True, allow_null=True
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Credential
        fields = (
            "id",
            "category",
            "category_id",
            "encrypted_title",
            "encrypted_username",
            "encrypted_email",
            "encrypted_password",
            "encrypted_notes",
            "encrypted_tags",
            "encrypted_website",
            "website_host",
            "password_strength",
            "password_changed_at",
            "is_favorite",
            "is_deleted",
            "deleted_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "category_id",
            "is_deleted",
            "deleted_at",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(
                user=request.user
            )

    def validate_encrypted_title(self, value):
        return self._validate_ciphertext(value, "encrypted_title")

    def validate_encrypted_password(self, value):
        return self._validate_ciphertext(value, "encrypted_password")

    def _validate_ciphertext(self, value: str, field: str) -> str:
        if not value or len(value) < 24:
            raise serializers.ValidationError(
                f"{field} must be AES-256-GCM ciphertext from the client."
            )
        return value

    def validate_password_strength(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Strength must be between 0 and 100.")
        return value

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class CredentialListSerializer(serializers.ModelSerializer):
    category_id = serializers.UUIDField(
        source="category.id", read_only=True, allow_null=True
    )

    class Meta:
        model = Credential
        fields = (
            "id",
            "category_id",
            "encrypted_title",
            "encrypted_username",
            "encrypted_email",
            "encrypted_password",
            "encrypted_website",
            "website_host",
            "password_strength",
            "is_favorite",
            "is_deleted",
            "deleted_at",
            "created_at",
            "updated_at",
        )
