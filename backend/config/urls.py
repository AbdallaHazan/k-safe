from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from accounts.admin_otp_views import admin_otp_verify

urlpatterns = [
    # Must be registered before the admin.site.urls include below, otherwise
    # that catch-all would swallow this path and 404 it from inside admin.
    path("admin/verify-otp/", admin_otp_verify, name="admin-otp-verify"),
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("vault.urls")),
    path("api/", include("security_center.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
