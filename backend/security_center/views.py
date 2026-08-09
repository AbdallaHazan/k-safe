from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SecurityLog
from .services import compute_security_score


class SecurityScoreView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(compute_security_score(request.user))


class SecurityLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        logs = SecurityLog.objects.filter(user=request.user)[:50]
        data = [
            {
                "id": str(log.id),
                "action": log.action,
                "ip_address": log.ip_address,
                "timestamp": log.timestamp,
                "metadata": log.metadata,
            }
            for log in logs
        ]
        return Response(data)


class DashboardStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from vault.models import Category, Credential

        user = request.user
        credentials = Credential.objects.filter(user=user, is_deleted=False)
        recent = credentials.order_by("-created_at")[:5]
        security = compute_security_score(user)
        return Response(
            {
                "welcome_name": user.name,
                "total_accounts": credentials.count(),
                "total_categories": Category.objects.filter(user=user).count(),
                "security_score": security["score"],
                "recent_credentials": [
                    {
                        "id": str(c.id),
                        "encrypted_title": c.encrypted_title,
                        "category_id": str(c.category_id) if c.category_id else None,
                        "website_host": c.website_host,
                        "created_at": c.created_at,
                        "updated_at": c.updated_at,
                    }
                    for c in recent
                ],
                "recent_activity": [
                    {
                        "id": str(log.id),
                        "action": log.action,
                        "timestamp": log.timestamp,
                    }
                    for log in SecurityLog.objects.filter(user=user)[:8]
                ],
            }
        )
