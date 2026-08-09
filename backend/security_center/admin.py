from django.contrib import admin

from .models import SecurityLog


@admin.register(SecurityLog)
class SecurityLogAdmin(admin.ModelAdmin):
    list_display = ("action", "user", "ip_address", "timestamp")
    list_filter = ("action",)
    search_fields = ("user__email", "ip_address")
