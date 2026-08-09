import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="categories",
    )
    name = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                name="unique_category_name_per_user",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.user.email})"


class Credential(models.Model):
    """
    Encrypted vault entry.

    Zero-knowledge rule: fields prefixed with `encrypted_` must already be
    ciphertext produced on the client with AES-256-GCM using the user's vault DEK.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="credentials",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="credentials",
    )

    encrypted_title = models.TextField()
    encrypted_username = models.TextField(blank=True, default="")
    encrypted_email = models.TextField(blank=True, default="")
    encrypted_password = models.TextField()
    encrypted_notes = models.TextField(blank=True, default="")
    encrypted_tags = models.TextField(blank=True, default="")
    # Full URL ciphertext — never stored in plaintext.
    encrypted_website = models.TextField(blank=True, default="")
    # Optional non-secret domain hint for server-side filtering (e.g. "github.com").
    website_host = models.CharField(blank=True, default="", max_length=255)

    password_strength = models.PositiveSmallIntegerField(
        default=0,
        help_text="0-100 strength score reported by client after local analysis.",
    )
    password_changed_at = models.DateTimeField(null=True, blank=True)
    is_favorite = models.BooleanField(default=False, db_index=True)

    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "-updated_at"]),
            models.Index(fields=["user", "category"]),
            models.Index(fields=["user", "is_deleted"]),
        ]

    def __str__(self):
        return f"Credential {self.id} for {self.user.email}"

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at", "updated_at"])

    def restore(self) -> None:
        self.is_deleted = False
        self.deleted_at = None
        self.save(update_fields=["is_deleted", "deleted_at", "updated_at"])
