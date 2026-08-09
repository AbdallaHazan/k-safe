from django.urls import path

from .views import (
    CategoryDetailView,
    CategoryListCreateView,
    CredentialRevealAuditView,
    VaultDetailView,
    VaultExportView,
    VaultImportView,
    VaultListCreateView,
    VaultPurgeView,
    VaultRestoreView,
    VaultTrashListView,
)

urlpatterns = [
    path("vault", VaultListCreateView.as_view(), name="vault-list"),
    path("vault/export", VaultExportView.as_view(), name="vault-export"),
    path("vault/import", VaultImportView.as_view(), name="vault-import"),
    path("vault/trash", VaultTrashListView.as_view(), name="vault-trash"),
    path("vault/<uuid:id>", VaultDetailView.as_view(), name="vault-detail"),
    path(
        "vault/<uuid:id>/reveal",
        CredentialRevealAuditView.as_view(),
        name="vault-reveal",
    ),
    path(
        "vault/<uuid:id>/restore",
        VaultRestoreView.as_view(),
        name="vault-restore",
    ),
    path(
        "vault/<uuid:id>/purge",
        VaultPurgeView.as_view(),
        name="vault-purge",
    ),
    path("categories", CategoryListCreateView.as_view(), name="category-list"),
    path(
        "categories/<uuid:id>",
        CategoryDetailView.as_view(),
        name="category-detail",
    ),
]
