from django.db import transaction
from django.db.models import Count, Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import SensitiveActionThrottle
from security_center.models import SecurityLog
from security_center.services import log_security_event

from .models import Category, Credential
from .serializers import (
    CategorySerializer,
    CredentialListSerializer,
    CredentialSerializer,
)


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class VaultListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return CredentialListSerializer
        return CredentialSerializer

    def get_queryset(self):
        qs = Credential.objects.filter(
            user=self.request.user, is_deleted=False
        ).select_related("category")
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("q", "").strip()
        if category:
            qs = qs.filter(category_id=category)
        if search:
            qs = qs.filter(
                Q(website_host__icontains=search)
                | Q(category__name__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        credential = serializer.save(user=self.request.user)
        log_security_event(
            user=self.request.user,
            action=SecurityLog.Action.CREDENTIAL_CREATED,
            ip_address=_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            metadata={"credential_id": str(credential.id)},
        )


class VaultDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CredentialSerializer
    lookup_field = "id"

    def get_queryset(self):
        return Credential.objects.filter(
            user=self.request.user, is_deleted=False
        ).select_related("category")

    def perform_update(self, serializer):
        credential = serializer.save()
        log_security_event(
            user=self.request.user,
            action=SecurityLog.Action.CREDENTIAL_UPDATED,
            ip_address=_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            metadata={"credential_id": str(credential.id)},
        )

    def perform_destroy(self, instance):
        credential_id = str(instance.id)
        instance.soft_delete()
        log_security_event(
            user=self.request.user,
            action=SecurityLog.Action.CREDENTIAL_DELETED,
            ip_address=_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            metadata={"credential_id": credential_id, "soft": True},
        )


class VaultTrashListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Credential.objects.filter(user=request.user, is_deleted=True)
        return Response(CredentialListSerializer(qs, many=True).data)


class VaultRestoreView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, id):
        try:
            credential = Credential.objects.get(
                user=request.user, id=id, is_deleted=True
            )
        except Credential.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        credential.restore()
        return Response(CredentialSerializer(credential).data)


class VaultPurgeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def delete(self, request, id):
        try:
            credential = Credential.objects.get(
                user=request.user, id=id, is_deleted=True
            )
        except Credential.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        credential_id = str(credential.id)
        credential.delete()
        log_security_event(
            user=request.user,
            action=SecurityLog.Action.CREDENTIAL_DELETED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            metadata={"credential_id": credential_id, "soft": False},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CredentialRevealAuditView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request, id):
        exists = Credential.objects.filter(
            user=request.user, id=id, is_deleted=False
        ).exists()
        if not exists:
            return Response(status=status.HTTP_404_NOT_FOUND)
        log_security_event(
            user=request.user,
            action=SecurityLog.Action.CREDENTIAL_REVEALED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            metadata={
                "credential_id": str(id),
                "reason": request.data.get("reason", "reveal"),
            },
        )
        return Response({"detail": "Logged."})


class CategoryListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CategorySerializer

    def get_queryset(self):
        return (
            Category.objects.filter(user=self.request.user)
            .annotate(
                credential_count=Count(
                    "credentials",
                    filter=Q(credentials__is_deleted=False),
                )
            )
            .order_by("name")
        )


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CategorySerializer
    lookup_field = "id"

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if category.is_default:
            return Response(
                {"detail": "Default categories cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if category.credentials.filter(is_deleted=False).exists():
            return Response(
                {
                    "detail": (
                        "Move or delete credentials in this category before deleting it."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class VaultExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        password = request.data.get("master_password", "")
        if not request.user.check_password(password):
            return Response(
                {"detail": "Invalid master password."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        credentials = Credential.objects.filter(user=request.user, is_deleted=False)
        categories = Category.objects.filter(user=request.user)
        log_security_event(
            user=request.user,
            action=SecurityLog.Action.VAULT_EXPORTED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response(
            {
                "exported_at": request.user.updated_at,
                "format_version": 2,
                "kdf_salt": request.user.kdf_salt,
                "encrypted_vault_key": request.user.encrypted_vault_key,
                "vault_key_nonce": request.user.vault_key_nonce,
                "categories": CategorySerializer(categories, many=True).data,
                "credentials": CredentialSerializer(credentials, many=True).data,
                "warning": (
                    "This export contains ciphertext only. Keep it offline and encrypted."
                ),
            }
        )


class VaultImportView(APIView):
    """
    Import ciphertext credentials from a KeySafe export.
    Does not accept or unwrap vault keys — client must already be unlocked
    with the same DEK that produced the ciphertext (or re-encrypt before import).
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [SensitiveActionThrottle]

    def post(self, request):
        password = request.data.get("master_password", "")
        if not request.user.check_password(password):
            return Response(
                {"detail": "Invalid master password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data.get("payload") or {}
        raw_credentials = payload.get("credentials") or []
        if not isinstance(raw_credentials, list) or not raw_credentials:
            return Response(
                {"detail": "payload.credentials must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = 0
        errors = []
        with transaction.atomic():
            for index, item in enumerate(raw_credentials):
                if not isinstance(item, dict):
                    errors.append({"index": index, "detail": "Invalid item."})
                    continue
                data = {
                    "encrypted_title": item.get("encrypted_title", ""),
                    "encrypted_username": item.get("encrypted_username", ""),
                    "encrypted_email": item.get("encrypted_email", ""),
                    "encrypted_password": item.get("encrypted_password", ""),
                    "encrypted_notes": item.get("encrypted_notes", ""),
                    "encrypted_tags": item.get("encrypted_tags", ""),
                    "encrypted_website": item.get("encrypted_website")
                    or item.get("website_url", ""),
                    "website_host": item.get("website_host", ""),
                    "password_strength": item.get("password_strength", 0) or 0,
                    "password_changed_at": item.get("password_changed_at"),
                    "category": None,
                }
                # Legacy plaintext website_url in old exports is treated as opaque
                # only if it already looks like ciphertext; otherwise skip URL.
                if data["encrypted_website"] and len(str(data["encrypted_website"])) < 24:
                    data["encrypted_website"] = ""
                serializer = CredentialSerializer(
                    data=data, context={"request": request}
                )
                if not serializer.is_valid():
                    errors.append({"index": index, "detail": serializer.errors})
                    continue
                serializer.save(user=request.user)
                created += 1

        log_security_event(
            user=request.user,
            action=SecurityLog.Action.VAULT_IMPORTED,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            metadata={"imported": created, "errors": len(errors), "kind": "import"},
        )
        return Response(
            {"imported": created, "errors": errors},
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )
