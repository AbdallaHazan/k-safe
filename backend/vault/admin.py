from django.contrib import admin

from .models import Category, Credential


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "is_default", "created_at")
    search_fields = ("name", "user__email")
    list_filter = ("is_default",)


@admin.register(Credential)
class CredentialAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "category", "website_host", "updated_at")
    search_fields = ("user__email", "website_host")
    readonly_fields = (
        "encrypted_title",
        "encrypted_username",
        "encrypted_email",
        "encrypted_password",
        "encrypted_notes",
        "encrypted_tags",
        "encrypted_website",
    )
